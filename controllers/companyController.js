const Company = require('../models/Company');
const User = require('../models/User');
const Category = require('../models/Category');

// @desc    Get all companies
// @route   GET /api/companies
const getAllCompanies = async (req, res) => {
    try {
        const { 
            q, category, categoryId, city, area, isFeatured, featured,
            page = 1, limit = 20, sort = 'rank', 
            rating, priceRange, openNow, lat, lng 
        } = req.query;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        let query = {};
        
        // 0. Enforce Approved status for public listings
        // (Admins can toggle this or use the admin route, but public frontend should only see Approved)
        if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'Developer')) {
            query.status = 'Approved';
        }

        // 1. Initial Location / Featured filters
        if (city) query.city_id = city;
        if (area) query.area_id = area;
        if (categoryId) query.category_id = categoryId;
        if (isFeatured !== undefined || featured !== undefined) {
            query.isFeatured = (isFeatured === 'true' || featured === 'true');
        }
        if (priceRange) query.priceRange = priceRange;
        if (rating) query.rating = { $gte: parseFloat(rating) };

        // 2. Fetch base companies matching filters
        let companies = await Company.find(query)
            .populate('country_id', 'name slug')
            .populate('city_id', 'name slug')
            .populate('state_id', 'name slug')
            .populate('area_id', 'name slug')
            .populate('owner', 'name email role')
            .lean(); 

        const Product = require('../models/Product');
        const Service = require('../models/Service');
        const companyIds = companies.map(c => c._id);

        // 3. Associate items
        const [allProducts, allServices] = await Promise.all([
            Product.find({ listingId: { $in: companyIds } }).lean(),
            Service.find({ listingId: { $in: companyIds } }).lean()
        ]);

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

        companies = companies.map(company => {
            company.products = productsByCompany[company._id.toString()] || [];
            company.services = servicesByCompany[company._id.toString()] || [];
            return company;
        });

        // 4. Advanced Filters (Post-fetch processing)
        if (q) {
            const regex = new RegExp(q, 'i');
            companies = companies.filter(company => 
                regex.test(company.name) || 
                regex.test(company.description) ||
                company.tags?.some(tag => regex.test(tag)) ||
                company.products.some(p => regex.test(p.name)) ||
                company.services.some(s => regex.test(s.name))
            );
        }

        if (openNow === 'true') {
            const now = new Date();
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = days[now.getDay()];
            const currentTime = now.getHours() * 60 + now.getMinutes();

            companies = companies.filter(c => {
                const hours = c.businessHours?.[dayName];
                if (!hours || hours.closed) return false;
                
                const [oH, oM] = hours.open.split(':').map(Number);
                const [cH, cM] = hours.close.split(':').map(Number);
                const openTime = oH * 60 + oM;
                const closeTime = cH * 60 + cM;
                
                return currentTime >= openTime && currentTime <= closeTime;
            });
        }

        // 5. Ranking & Distance Calculation
        const Setting = require('../models/Setting');
        const siteSettings = await Setting.findOne().lean();
        const weights = siteSettings?.rankingWeights || { reviews: 1.0, distance: 1.0, responseTime: 1.0, premium: 1.5 };

        companies = companies.map(c => {
            let score = 0;
            let distance = null;

            if (lat && lng && c.latitude && c.longitude) {
                // simple Euclidean for demonstration, could use Haversine
                distance = Math.sqrt(Math.pow(c.latitude - lat, 2) + Math.pow(c.longitude - lng, 2));
                score -= (distance * 10 * weights.distance); 
            }

            if (c.rating) score += (c.rating * weights.reviews);
            if (c.isFeatured) score += (10 * weights.premium);
            score += (c.manualRank || 0) * 100;

            return { ...c, rankScore: score, distance };
        });

        // 6. Final Sort
        if (sort === 'rating') companies.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        else if (sort === 'reviews') companies.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
        else if (sort === 'latest') companies.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        else if (sort === 'distance' && lat && lng) companies.sort((a, b) => a.distance - b.distance);
        else companies.sort((a, b) => b.rankScore - a.rankScore);

        // 7. Pagination
        const total = companies.length;
        const paginatedCompanies = companies.slice(skip, skip + parseInt(limit));

        res.json({
            data: paginatedCompanies,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
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

// @desc    Get similar businesses
// @route   GET /api/companies/:id/similar
const getSimilarBusinesses = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ msg: 'Company not found' });

        const similar = await Company.find({
            _id: { $ne: company._id },
            category_id: company.category_id,
            city_id: company.city_id
        })
        .sort({ rating: -1, reviewCount: -1 })
        .limit(6)
        .lean();

        res.json(similar);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get questions for a business
// @route   GET /api/companies/:id/questions
const getQuestions = async (req, res) => {
    try {
        const Question = require('../models/Question');
        const questions = await Question.find({ businessId: req.params.id })
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .lean();
        res.json(questions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Post a question
// @route   POST /api/companies/:id/questions
const postQuestion = async (req, res) => {
    try {
        const Question = require('../models/Question');
        const newQuestion = new Question({
            businessId: req.params.id,
            userId: req.user._id,
            questionText: req.body.questionText
        });
        await newQuestion.save();
        res.json(newQuestion);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

const getCompanyById = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id)
            .populate('category_id', 'name slug')
            .populate('city_id', 'name slug')
            .populate('area_id', 'name slug');
        if (!company) return res.status(404).json({ msg: 'Company not found' });
        res.json(company);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

module.exports = { 
    getAllCompanies, 
    createCompany, 
    updateCompany, 
    deleteCompany, 
    getCompanyBySlug, 
    getCompanyById,
    claimCompany, 
    autocomplete,
    getSimilarBusinesses,
    getQuestions,
    postQuestion
};
