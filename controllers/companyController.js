const Company = require('../models/Company');
const User = require('../models/User');
const Category = require('../models/Category');

// @desc    Get all companies
// @route   GET /api/companies
const getAllCompanies = async (req, res) => {
    try {
        const { q, category, categoryId, city, area, isFeatured, featured } = req.query;
        let query = {};

        // 1. Initial Location / Featured filters
        if (city) query.city_id = city;
        if (area) query.area_id = area;
        if (isFeatured !== undefined || featured !== undefined) {
            query.isFeatured = (isFeatured === 'true' || featured === 'true');
        }

        // scoping for Brand Owner
        if (req.user) {
            const isOwner = req.user.role === 'Brand Owner' || req.user.role === 'Company Owner';
            if (isOwner) {
                query.owner = req.user._id;
            }
        }

        // 2. Fetch base companies matching location/featured filters
        let companies = await Company.find(query)
            .populate('country_id', 'name slug')
            .populate('city_id', 'name slug')
            .populate('state_id', 'name slug')
            .populate('area_id', 'name slug')
            .populate('owner', 'name email role')
            .sort({ createdAt: -1 })
            .lean(); 

        const Product = require('../models/Product');
        const Service = require('../models/Service');
        const companyIds = companies.map(c => c._id);

        // 3. Prepare queries for Products & Services linked to these companies
        let productQuery = { listingId: { $in: companyIds }, status: 'Active' };
        let serviceQuery = { listingId: { $in: companyIds }, status: 'Active' };

        // If a specific category ID is passed from the frontend (parent or sub)
        if (categoryId) {
            const catMatch = { $or: [{ categoryId: categoryId }, { subCategoryId: categoryId }] };
            productQuery = { ...productQuery, ...catMatch };
            serviceQuery = { ...serviceQuery, ...catMatch };
        }

        // 4. Fetch associated items
        const [allProducts, allServices] = await Promise.all([
            Product.find(productQuery).lean(),
            Service.find(serviceQuery).lean()
        ]);

        // 5. Build lookup maps for fast attachment
        const productsByCompany = {};
        allProducts.forEach(p => {
            const cid = p.listingId.toString();
            if(!productsByCompany[cid]) productsByCompany[cid] = [];
            productsByCompany[cid].push(p);
        });

        const servicesByCompany = {};
        allServices.forEach(s => {
            const cid = s.listingId.toString();
            if(!servicesByCompany[cid]) servicesByCompany[cid] = [];
            servicesByCompany[cid].push(s);
        });

        // 6. Attach arrays to companies and Filter
        companies = companies.map(company => {
            company.products = productsByCompany[company._id.toString()] || [];
            company.services = servicesByCompany[company._id.toString()] || [];
            return company;
        });

        // Filter by Category/SubCategory ID vs String (Support both Legacy and New logic)
        if (categoryId || category) {
            companies = companies.filter(c => {
                // If the company's explicit legacy category matches the string
                const matchesLegacyString = category && c.category === category;
                // Or if it has any product/service matching the category ObjectId
                const hasMatchingProduct = c.products.length > 0;
                const hasMatchingService = c.services.length > 0;
                
                return matchesLegacyString || hasMatchingProduct || hasMatchingService;
            });
        }

        // 7. Keyword search (name, description, or attached product/service name)
        if (q) {
            const regex = new RegExp(q, 'i');
            companies = companies.filter(company => {
                const matchCompany = regex.test(company.name) || regex.test(company.description);
                const matchProduct = company.products.some(p => regex.test(p.name) || regex.test(p.shortDescription));
                const matchService = company.services.some(s => regex.test(s.name) || regex.test(s.shortDescription));
                
                return matchCompany || matchProduct || matchService;
            });
        }

        // Sort by createdAt descending
        companies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(companies);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Create a new company
// @route   POST /api/companies
const createCompany = async (req, res) => {
    try {
        const body = { ...req.body };
        // Sanitize fields - convert empty strings to null to avoid CastError
        ['country_id', 'state_id', 'city_id', 'area_id', 'owner', 'latitude', 'longitude'].forEach(field => {
            if (body[field] === '') body[field] = null;
        });

        // For Brand Owner, force the owner to be themselves
        if (req.user) {
            const isOwner = req.user.role === 'Brand Owner' || req.user.role === 'Company Owner';
            if (isOwner) {
                req.body.owner = req.user._id;
            }
        }

        const company = new Company(body);
        await company.save();

        const populatedCompany = await Company.findById(company._id)
            .populate('city_id', 'name slug')
            .populate('state_id', 'name slug')
            .populate('area_id', 'name slug')
            .populate('owner', 'name email')
            .lean();

        res.status(201).json(populatedCompany);
    } catch (err) {
        console.error('Create Company Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Update a company
// @route   PUT /api/companies/:id
const updateCompany = async (req, res) => {
    try {
        let company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ msg: 'Company not found' });

        // Authorization check for Brand Owner
        const isOwner = req.user.role === 'Brand Owner' || req.user.role === 'Company Owner';
        if (isOwner && company.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ msg: 'Not authorized to update this company' });
        }

        const body = { ...req.body };
        // Sanitize fields
        ['country_id', 'state_id', 'city_id', 'area_id', 'owner', 'latitude', 'longitude'].forEach(field => {
            if (body[field] === '') body[field] = null;
        });

        // For Brand Owner, don't allow changing the owner
        if (req.user.role === 'Brand Owner') {
            delete body.owner;
        }

        company = await Company.findByIdAndUpdate(
            req.params.id,
            { $set: body },
            { new: true }
        )
        .populate('city_id', 'name slug')
        .populate('state_id', 'name slug')
        .populate('area_id', 'name slug')
        .populate('owner', 'name email role')
        .lean();

        res.json(company);
    } catch (err) {
        console.error('Update Company Error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Company not found' });
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Delete a company
// @route   DELETE /api/companies/:id
const deleteCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ msg: 'Company not found' });

        // Authorization check for Brand Owner
        const isOwner = req.user.role === 'Brand Owner' || req.user.role === 'Company Owner';
        if (isOwner && company.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ msg: 'Not authorized to delete this company' });
        }

        await Company.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Company removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Company not found' });
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = { getAllCompanies, createCompany, updateCompany, deleteCompany };
