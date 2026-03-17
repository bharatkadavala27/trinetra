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
        if (categoryId) query.category_id = categoryId;
        if (isFeatured !== undefined || featured !== undefined) {
            query.isFeatured = (isFeatured === 'true' || featured === 'true');
        }

        // scoping for Brand Owner / Dashboard
        if (req.user) {
            const isOwner = req.user.role === 'Brand Owner' || req.user.role === 'Company Owner';
            const forceOwned = req.query.owned === 'true';

            // If forced (Dashboard) or if it's a Brand Owner not on a public search
            if (forceOwned || (isOwner && !q && !city && !area && !categoryId)) {
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
                // 1. Match by specific category ID (Newly added)
                const matchesCategoryId = categoryId && c.category_id && c.category_id.toString() === categoryId;
                
                // 2. Match by explicit legacy category string
                const matchesLegacyString = category && c.category === category;
                
                // 3. Match if it has any product/service matching the category ObjectId
                const hasMatchingProduct = c.products.length > 0;
                const hasMatchingService = c.services.length > 0;
                
                return matchesCategoryId || matchesLegacyString || hasMatchingProduct || hasMatchingService;
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

        // 8. AI Ranking & Recommendation Logic
        const Setting = require('../models/Setting');
        const siteSettings = await Setting.findOne().lean();
        const weights = siteSettings?.rankingWeights || {
            reviews: 1.0,
            distance: 1.0,
            responseTime: 1.0,
            premium: 1.5
        };

        companies = companies.map(c => {
            let score = 0;
            
            // Factor 1: Reviews & Ratings
            if (c.rating) score += (c.rating * weights.reviews);
            if (c.reviewCount) score += (Math.log10(c.reviewCount + 1) * weights.reviews * 0.5);
            
            // Factor 2: Premium Status (isFeatured)
            if (c.isFeatured) score += (10 * weights.premium);
            
            // Factor 3: Response Time (Penalize slow response)
            // Assuming 30 mins is baseline, faster is better
            const responsePenalty = (c.responseTime || 30) / 60; // normalized to hours
            score -= (responsePenalty * weights.responseTime);
            
            // Factor 4: Manual Rank (Highest Priority)
            score += (c.manualRank || 0) * 100;

            return { ...c, rankScore: score };
        });

        // Sort by rankScore descending
        companies.sort((a, b) => b.rankScore - a.rankScore);

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

        // For logged-in users, assign them as owner and ensure they are at least a Brand Owner
        if (req.user) {
            body.owner = req.user._id;
            
            // If they are a regular 'User', upgrade them so they can manage their brands
            if (req.user.role === 'User') {
                await User.findByIdAndUpdate(req.user._id, { role: 'Brand Owner' });
            }
        }

        // Fraud & Spam Detection
        const FraudAlert = require('../models/FraudAlert');
        const { realTimeFraudCheck } = require('./fraudController');
        
        const metadata = {
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const fraudResult = await realTimeFraudCheck('listing', body, req.user?._id, metadata);

        if (fraudResult.isSuspicious) {
            // Auto-flag the company but still create it as Pending
            body.verificationStatus = 'Flagged';
            body.status = 'Pending';
        }

        const company = new Company(body);
        await company.save();

        if (fraudResult.isSuspicious) {
            // Create the fraud alert linked to the new company
            await FraudAlert.create({
                ...fraudResult.alertData,
                targetId: company._id,
                targetModel: 'Company',
                status: 'pending'
            });
        }

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

        // Audit Trail Logic
        const trackFields = ['name', 'status', 'verified', 'verificationStatus', 'owner', 'manualRank'];
        const changes = [];
        trackFields.forEach(field => {
            if (body[field] !== undefined && String(body[field]) !== String(company[field])) {
                changes.push({
                    field: field,
                    oldValue: company[field],
                    newValue: body[field],
                    changedBy: req.user._id
                });
            }
        });

        if (changes.length > 0) {
            await Company.findByIdAndUpdate(req.params.id, {
                $push: { changeHistory: { $each: changes } }
            });
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

// @desc    Get company by slug
// @route   GET /api/companies/slug/:slug
const getCompanyBySlug = async (req, res) => {
    try {
        const company = await Company.findOne({ slug: req.params.slug })
            .populate('country_id', 'name slug')
            .populate('city_id', 'name slug')
            .populate('state_id', 'name slug')
            .populate('area_id', 'name slug')
            .populate('owner', 'name email role');

        if (!company) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        const Product = require('../models/Product');
        const Service = require('../models/Service');

        const [products, services] = await Promise.all([
            Product.find({ listingId: company._id, status: 'Active' })
                .populate('categoryId', 'name slug')
                .populate('subCategoryId', 'name slug')
                .populate('brandId', 'name slug')
                .lean(),
            Service.find({ listingId: company._id, status: 'Active' })
                .populate('categoryId', 'name slug')
                .populate('subCategoryId', 'name slug')
                .lean()
        ]);

        const companyObj = company.toObject();
        companyObj.products = products;
        companyObj.services = services;

        res.json(companyObj);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Claim a company
// @route   POST /api/companies/:id/claim
const claimCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        if (company.claimed) {
            return res.status(400).json({ msg: 'This company is already claimed' });
        }

        // Assign current user as owner
        company.owner = req.user._id;
        company.claimed = true;
        // Optional: Keep verified false until admin reviews the claim
        // company.verified = false; 

        await company.save();

        const populatedCompany = await Company.findById(company._id)
            .populate('owner', 'name email role')
            .lean();

        res.json({
            success: true,
            msg: 'Company claimed successfully!',
            company: populatedCompany
        });
    } catch (err) {
        console.error('Claim Company Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Autocomplete for search (Keywords, Categories, Companies)
// @route   GET /api/companies/autocomplete
// @access  Public
const autocomplete = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);

        const regex = new RegExp(q, 'i');
        
        // Parallel search for Categories and Companies
        const [categories, companyNames] = await Promise.all([
            Category.find({ name: regex }).limit(5).select('name -_id').lean(),
            Company.find({ name: regex }).limit(5).select('name -_id').lean()
        ]);

        // Flatten and merge results
        const results = [
            ...categories.map(c => ({ text: c.name, type: 'Category' })),
            ...companyNames.map(c => ({ text: c.name, type: 'Business' }))
        ];

        res.json(results);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = { getAllCompanies, createCompany, updateCompany, deleteCompany, getCompanyBySlug, claimCompany, autocomplete };
