require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express()
const nodemailer = require('nodemailer');
const port = process.env.PORT || 3000
const stripe = require("stripe")(process.env.STRIP_SECRET);
const { MongoClient, ObjectId } = require('mongodb');
const { uploadImagesMiddleware, uploadToCloudinary, settingsUploadMiddleware, upload } = require('./utils/CloudinaryConfig');
const { calculateSubscriptionDates } = require('./utils/durationCalc.js');


const SSLCommerzPayment = require('sslcommerz-lts')
const store_id = process.env.STORE_ID
const store_passwd = process.env.STORE_PASS
const is_live = false //true for live, false for sandbox


app.use(cors());
app.use(express.json());


// ------------------token verification------------------

// const verifyToken = async (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith('Bearer ')) {
//     return res.status(401).send({ error: true, message: 'Unauthorized access! No token provided.' });
//   }

//   const token = authHeader.split(' ')[1];
//   try {
//     const decodedToken = await admin.auth().verifyIdToken(token);
//     req.user = decodedToken;
//     next();
//   } catch (error) {
//     return res.status(403).send({ error: true, message: 'Invalid or expired token.' });
//   }
// };

// ১. নোডমেইলার ট্রান্সপোর্টার তৈরি (গুগল অ্যাপ পাসওয়ার্ড দিয়ে)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // আপনার জিমেইল আইডি
        pass: process.env.EMAIL_PASS  // গুগল থেকে পাওয়া ১৬ অক্ষরের অ্যাপ পাসওয়ার্ড
    }
});


const client = new MongoClient(process.env.MONGO_URI);
async function connectToMongoDB() {
    try {
        await client.connect();

        const db = client.db('realEstate');
        const projectsCollection = db.collection('projects');
        const settingsCollection = db.collection('settings');
        const slidersCollection = db.collection('sliders');
        const agentsCollection = db.collection('agents');
        const usersCollection = db.collection('users');
        const bookingsCollection = db.collection('bookings');
        const transactionsCollection = db.collection('transactions');
        const membersCollection = db.collection('members');
        const blogsCollection = db.collection('blogs');
        const subscriptionsCollection = db.collection('subscriptions');




        //  Get apis here  




        app.get('/projects', async (req, res) => {
            try {
                const { agentId, id } = req.query;

                if (agentId && id) {
                    const query = { agentId: agentId, _id: new ObjectId(id) };
                    const result = await projectsCollection.findOne(query);

                    if (!result) {
                        return res.status(404).send({ message: "We dont get the project" });
                    }
                    return res.send(result);
                }


                if (agentId) {
                    const query = { agentId: agentId };
                    const result = await projectsCollection.find(query).toArray();
                    return res.send(result);
                }


                const result = await projectsCollection.find().toArray();
                res.send(result);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error", error });
            }
        });


        // get the settings based on the email/domain name

        app.get('/settings', async (req, res) => {
            const { agentId } = req.query;
            const query = { agentId: agentId };
            const result = await settingsCollection.findOne(query);
            res.send(result);
        })


        // get the slider data 

        app.get('/slider', async (req, res) => {
            const { agentId } = req.query;
            const query = { agentId: agentId };
            const result = await slidersCollection.find(query).toArray();
            res.send(result);

        })


        // get  testimonial data

        app.get('/testimonial', async (req, res) => {

        })


        // get all the agents data 

        app.get('/agents', async (req, res) => {
            try {
                const { hostname, email } = req.query;

                let query = {};

                if (hostname) {
                    // "http://" ba "https://" ebong trailing slash "/" bad diye clean domain extract
                    const cleanHostname = hostname
                        .replace(/^https?:\/\//, '')
                        .replace(/\/$/, '')
                        .trim();

                    // Regex query: Protocol ba trailing slash er variation bypass korar jonno
                    query = {
                        "metadata.targetAddress": {
                            $regex: cleanHostname,
                            $options: "i"
                        }
                    };
                } else if (email) {
                    query = { email: email.trim().toLowerCase() };
                } else {
                    return res.status(400).send({
                        error: true,
                        message: "Please provide either hostname or email in query parameters."
                    });
                }

                const result = await agentsCollection.find(query).toArray();

                if (!result || result.length === 0) {
                    return res.status(404).send({
                        success: false,
                        message: "No agent found matching the criteria."
                    });
                }

                return res.status(200).send(result);

            } catch (error) {
                console.error("Error fetching agents:", error);
                return res.status(500).send({
                    error: true,
                    message: "Internal Server Error"
                });
            }
        });



        app.get('/api/my-bookings', async (req, res) => {
            try {
                const { userId } = req.query;

                // ১. userId ভ্যালিডেশন
                if (!userId || !ObjectId.isValid(userId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Valid User ID is required'
                    });
                }

                // ২. নির্দিষ্ট ইউজারের বুকিং ফেচ করা (সর্বশেষ বুকিং সবার আগে)
                const userBookings = await bookingsCollection
                    .find({ userId: new ObjectId(userId) })
                    .sort({ createdAt: -1, _id: -1 })
                    .toArray();

                if (userBookings.length === 0) {
                    return res.json({ success: true, bookings: [] });
                }

                // ৩. বুকিং ডাটা থেকে সব projectId এক্সট্র্যাক্ট করা (ইনভ্যালিড আইডি ফিল্টারসহ)
                const projectIds = userBookings
                    .filter(b => b.projectId && ObjectId.isValid(b.projectId))
                    .map(b => new ObjectId(b.projectId));

                // ৪. projectsCollection থেকে প্রজেক্টের ডাটা আনা
                const projects = await projectsCollection
                    .find({ _id: { $in: projectIds } })
                    .toArray();

                // ৫. প্রজেক্ট ডাটা এবং পেমেন্ট ক্যালকুলেশন সিঙ্ক করে রেসপন্স অবজেক্ট তৈরি
                const fullBookingsData = userBookings.map(booking => {
                    const project = projects.find(
                        p => p._id.toString() === booking.projectId?.toString()
                    );

                    // পেমেন্ট ফিল্ডগুলোর সেফটি হ্যান্ডলিং
                    const totalAmount = Number(booking.totalAmount) || 0;
                    const totalPaid = Number(booking.totalPaid) || 0;
                    const totalDue = Number(booking.totalDue) ?? Math.max(0, totalAmount - totalPaid);

                    return {
                        ...booking,
                        totalAmount,
                        totalPaid,
                        totalDue,
                        projectDetails: project || null
                    };
                });

                // ৬. সম্পূর্ণ বুকিং ডাটা রিটার্ন
                res.json({ success: true, bookings: fullBookingsData });

            } catch (error) {
                console.error('Error fetching user bookings:', error);
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // ২. ইউজার নতুন পেমেন্ট দিলে 'bookingsCollection'-এ Push করার API
        // app.post('/api/submit-payment', async (req, res) => {
        //     try {
        //         const { bookingId, paymentMethod, bankName, transactionId, amount } = req.body;

        //         if (!bookingId || !transactionId || !amount) {
        //             return res.status(400).json({ success: false, message: 'All required fields must be provided' });
        //         }

        //         const newTransaction = {
        //             _id: new ObjectId(),
        //             paymentMethod, // 'cash' or 'bank'
        //             bankName: paymentMethod === 'bank' ? bankName : 'N/A',
        //             transactionId,
        //             amount: Number(amount),
        //             status: 'pending', // অ্যাডমিন পরবর্তীতে এটি 'approved' করবে
        //             createdAt: new Date()
        //         };

        //         // bookingsCollection-এ নির্দিষ্ট বুকিং ডকুমেন্টের 'transactions' অ্যারেতে Push করা
        //         const result = await bookingsCollection.updateOne(
        //             { _id: new ObjectId(bookingId) },
        //             { $push: { transactions: newTransaction } }
        //         );

        //         if (result.modifiedCount > 0) {
        //             res.json({ success: true, message: 'Payment submitted for Admin approval!' });
        //         } else {
        //             res.status(400).json({ success: false, message: 'Booking not found' });
        //         }

        //     } catch (error) {
        //         console.error('Error submitting payment:', error);
        //         res.status(500).json({ success: false, message: error.message });
        //     }
        // });


        // 🔄 GET API: Query অনুযায়ী Specific Agent-এর Team Members Fetch করা
        app.get('/api/admin/team-members', async (req, res) => {
            try {
                const { agentId } = req.query; // 👈 ফ্রন্টএন্ড থেকে Query string ধরা হলো (?agentId=...)

                // ১. কোয়েরি অবজেক্ট তৈরি করা
                let filterQuery = {};

                // যদি ফ্রন্টএন্ড থেকে agentId পাঠানো হয়, তবেই সেটা দিয়ে ফিল্টার হবে
                if (agentId) {
                    filterQuery.agentId = agentId;

                }

                // ২. ডাটাবেজ থেকে ডাটা খোঁজা
                const members = await membersCollection
                    .find(filterQuery)
                    .toArray();

                // ৩. রেসপন্স পাঠানো
                res.status(200).send(members);

            } catch (error) {
                console.error('Error fetching team members:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to fetch team members.',
                    error: error.message,
                });
            }
        });

        app.get('/admin/transactions', async (req, res) => {
            try {
                const { bookingId } = req.query;

                // ১. bookingId চেক এবং ObjectId ভ্যালিডেশন
                if (!bookingId || !ObjectId.isValid(bookingId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Valid Booking ID is required'
                    });
                }

                // ২. ট্রানজ্যাকশন খোঁজা এবং সর্বশেষ পেমেন্ট আগে সাজানো (Descending Order)
                const query = { bookingId: new ObjectId(bookingId) };
                const transactions = await transactionsCollection
                    .find(query)
                    .sort({ createdAt: -1, _id: -1 })
                    .toArray();

                // ৩. স্ট্যান্ডার্ড রেসপন্স ব্যাক করা
                res.json({
                    success: true,
                    transactions
                });

            } catch (error) {
                console.error('Error fetching transactions:', error);
                res.status(500).json({
                    success: false,
                    message: 'Server error while fetching transactions'
                });
            }
        });


        // blog collection find api 

        app.get('/api/blogs', async (req, res) => {
            try {
                const { agentId, id } = req.query;

                if (agentId && id) {
                    const query = { agentId: agentId, _id: new ObjectId(id) };
                    const result = await blogsCollection.findOne(query);

                    if (!result) {
                        return res.status(404).send({ message: "We dont get the blog" });
                    }
                    return res.send(result);
                }


                if (agentId) {
                    const query = { agentId: agentId };
                    const result = await blogsCollection.find(query).sort({ createdAt: -1 }).toArray();
                    return res.send(result);
                }


                const result = await blogsCollection.find().toArray();
                res.send(result);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error", error });
            }
        });








        // ==========================================
        // ২. এডমিন প্যানেল: অল ট্রানজ্যাকশন লিস্ট পাওয়ার API (Pending, Approved & Rejected)
        // ==========================================
        app.get('/api/admin/pending-payments', async (req, res) => {
            try {
                // Aggregate দিয়ে User এবং Booking-এর সাথে JOIN করা
                const allTxns = await transactionsCollection.aggregate([
                    { $sort: { createdAt: -1, _id: -1 } }, // নতুন ট্রানজ্যাকশন সবার উপরে
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'userId',
                            foreignField: '_id',
                            as: 'user'
                        }
                    },
                    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: 'bookings',
                            localField: 'bookingId',
                            foreignField: '_id',
                            as: 'booking'
                        }
                    },
                    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            bookingId: 1,
                            userId: 1,
                            amount: 1,
                            paymentType: 1,
                            senderName: 1,
                            paymentMethod: 1,
                            bankName: 1,
                            transactionId: 1,
                            status: 1, // 'approved', 'rejected', or 'pending'
                            createdAt: 1,
                            'user._id': 1,
                            'user.name': 1,
                            'user.email': 1,
                            'user.phone': 1,
                            'booking._id': 1,
                            'booking.projectName': 1,
                            'booking.totalAmount': 1,
                            'booking.totalPaid': 1,
                            'booking.totalDue': 1
                        }
                    }
                ]).toArray();

                res.status(200).json({
                    success: true,
                    count: allTxns.length,
                    data: allTxns
                });

            } catch (error) {
                console.error("Error fetching transactions:", error);
                res.status(500).json({ success: false, message: error.message });
            }
        });


        // Master Unified API - Filtered by agentId (if provided)
        app.get('/api/dashboard-master', async (req, res) => {
            try {
                const { agentId } = req.query;

                // ১. সাধারণ ফিল্টার অবজেক্ট
                const filter = agentId ? { agentId: agentId } : {};

                // ২. Promise.all দিয়ে ফিল্টার করা ডাটা প্যারালালে ফেচ করা
                const [
                    projects,
                    bookings,
                    users,
                    transactions,
                    teamMembers,
                    sliders,
                    settings,
                    blogs
                ] = await Promise.all([
                    // প্রজেক্টসমূহ
                    projectsCollection.find(filter).toArray(),

                    // বুকিংসহ প্রজেক্ট ডিটেইলস (agentId থাকলে প্রজেক্ট কুয়েরি ফিল্টার হবে)
                    bookingsCollection.aggregate([
                        {
                            $lookup: {
                                from: 'projects',
                                localField: 'projectId',
                                foreignField: '_id',
                                as: 'projectDetails'
                            }
                        },
                        { $unwind: { path: '$projectDetails', preserveNullAndEmptyArrays: true } },
                        ...(agentId ? [{ $match: { "projectDetails.agentId": agentId } }] : []),
                        { $sort: { createdAt: -1 } }
                    ]).toArray(),

                    // ইউজারদের তালিকা (পাসওয়ার্ড ছাড়া)
                    usersCollection.find({}, { projection: { password: 0 } }).toArray(),

                    // ট্রানজেকশনসমূহ (agentId অনুযায়ী ফিল্টার করা প্রজেক্ট বা বুকিংয়ের সাপেক্ষে)
                    transactionsCollection.aggregate([
                        {
                            $lookup: {
                                from: 'bookings',
                                localField: 'bookingId',
                                foreignField: '_id',
                                as: 'booking'
                            }
                        },
                        { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: 'projects',
                                localField: 'booking.projectId',
                                foreignField: '_id',
                                as: 'project'
                            }
                        },
                        { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'userId',
                                foreignField: '_id',
                                as: 'user'
                            }
                        },
                        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                        ...(agentId ? [{ $match: { "project.agentId": agentId } }] : []),
                        { $sort: { createdAt: -1 } }
                    ]).toArray(),

                    // টিম মেম্বার
                    membersCollection.find(filter).toArray(),

                    // স্লাইডার
                    slidersCollection.find(filter).toArray(),

                    // সেটিংস
                    settingsCollection.find(filter).toArray(),

                    // ব্লগসমূহ
                    blogsCollection.find(filter).sort({ createdAt: -1 }).toArray()
                ]);

                // মোট এপ্রুভড আয় হিসাব
                const totalRevenue = transactions
                    .filter(t => t.status === 'approved')
                    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

                // পেন্ডিং পেমেন্ট আলাদা ফিল্টার
                const pendingTransactions = transactions.filter(t => t.status === 'pending');

                res.status(200).json({
                    success: true,
                    filterApplied: agentId ? { agentId } : "All Data",
                    summaryStats: {
                        totalProjects: projects.length,
                        totalBookings: bookings.length,
                        totalUsers: users.length,
                        totalRevenue,
                        pendingPaymentsCount: pendingTransactions.length
                    },
                    data: {
                        projects,
                        bookings,
                        users,
                        transactions,
                        pendingTransactions,
                        teamMembers,
                        sliders,
                        settings: settings[0] || null,
                        blogs
                    }
                });

            } catch (error) {
                console.error("Error fetching filtered master dashboard data:", error);
                res.status(500).json({
                    success: false,
                    message: "Failed to load dashboard data",
                    error: error.message
                });
            }
        });




        // to get the subscriptions data 


        app.get('/subscription', async (req, res) => {
            const { t_id } = req.query;

            const query = { tran_id: t_id };

            const result = await subscriptionsCollection.findOne(query);
            res.send(result);
        })









        // post apis here 



        // add projects (Updated for PropertyManagement.jsx)
        app.post('/projects', uploadImagesMiddleware, async (req, res) => {
            try {
                // ১. টেক্সট ডাটা ও নতুন ফিল্ডসমূহ রিসিভ করা
                const {
                    title,
                    price,
                    location,
                    category,
                    tag,
                    land,
                    status,
                    description,
                    brochureLink,
                    totalShares,
                    sharePrice,
                    bookingPrice,
                    buildingType,
                    frontRoad,
                    floors,
                    unitPerFloor,
                    passengerLift,
                    cargoLift,
                    electricityBackup,
                    rooftopGardening,
                    carParking,
                    conventionHall,
                    domain,
                    agentId,
                    amenities,
                    availableUnits,
                    availableShares
                } = req.body;

                // ২. ক্লাউডিনারিতে ফাইল আপলোড ও URL আনা (ফাইল না থাকলে ক্র্যাশ প্রতিরোধ সহ)
                let imageUrls = [];
                if (req.files && req.files.length > 0) {
                    imageUrls = await uploadToCloudinary(req.files);
                }

                // ৩. JSON ডাটা সেফলি পার্স করা (amenities ও availableUnits)
                let parsedAmenities = [];
                if (amenities) {
                    try {
                        parsedAmenities = typeof amenities === 'string' ? JSON.parse(amenities) : amenities;
                    } catch (err) {
                        console.warn("Amenities JSON parse error:", err.message);
                    }
                }

                let parsedUnits = [];
                if (availableUnits) {
                    try {
                        parsedUnits = typeof availableUnits === 'string' ? JSON.parse(availableUnits) : availableUnits;
                    } catch (err) {
                        console.warn("AvailableUnits JSON parse error:", err.message);
                    }
                }

                // ৪. ফাইনাল ডাটা অবজেক্ট তৈরি
                const finalProjectData = {
                    title: title || "",
                    price: price || "",
                    location: location || "",
                    category: category || "Apartments",
                    tag: tag || "",
                    land: land || "",
                    status: status || "completed",
                    description: description || "",
                    brochureLink: brochureLink || "",
                    domain: domain || "",
                    agentId: agentId || "",

                    // Share Structure
                    totalShares: Number(totalShares) || 0,
                    bookingPrice: Number(bookingPrice) || 0,
                    sharePrice: Number(sharePrice) || 0,
                    availableShares: Number(availableShares ?? totalShares) || 0,

                    // Building Specifications
                    buildingType: buildingType || "Residential",
                    floors: floors || 'B+G+6',
                    frontRoad: frontRoad || "",
                    unitPerFloor: Number(unitPerFloor) || 0,
                    passengerLift: Number(passengerLift) || 0,
                    cargoLift: Number(cargoLift) || 0,

                    // Features (FormData-র স্ট্রিং 'true'/'false' কে বুলিয়ানে কাস্ট করা)
                    electricityBackup: electricityBackup === 'true' || electricityBackup === true,
                    rooftopGardening: rooftopGardening === 'true' || rooftopGardening === true,
                    carParking: carParking === 'true' || carParking === true,
                    conventionHall: conventionHall === 'true' || conventionHall === true,

                    // Dynamic Data
                    amenities: parsedAmenities,
                    availableUnits: parsedUnits,

                    // ইমেজ হ্যান্ডলিং (পূর্বের মতো)
                    img: imageUrls.length > 0 ? imageUrls[0] : "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
                    allImages: imageUrls,
                    images: imageUrls, // UI টেবিলের p.images এর সুবিধার্থে

                    createdAt: new Date()
                };

                // ৫. ডাটাবেজে ইনসার্ট
                const result = await projectsCollection.insertOne(finalProjectData);

                // ফ্রন্টএন্ডে রিয়েল-টাইম আপডেটের জন্য আইডি সহ অবজেক্ট পাঠানো
                const savedProject = {
                    _id: result.insertedId,
                    ...finalProjectData
                };

                res.status(201).send(savedProject);

            } catch (error) {
                console.error("Error in /projects route:", error);
                res.status(500).send({ error: true, message: "Internal Server Error" });
            }
        });


        // add agent data 
        app.post('/api/agents/register', upload.single('image'), async (req, res) => {
            try {
                const {
                    firstName,
                    lastName,
                    email,
                    uid,
                    avatar,
                    authProvider
                } = req.body;

                const finalAgentId = uid || req.user?.uid;
                const finalEmail = email || req.user?.email;

                if (!finalEmail || !finalAgentId) {
                    return res.status(400).send({
                        error: true,
                        message: "User Email and ID are required!"
                    });
                }

                // ডুপ্লিকেট ইউজার চেক
                const existingAgent = await agentsCollection.findOne({ email: finalEmail });
                if (existingAgent) {
                    return res.status(400).send({
                        error: true,
                        message: "This Email or Account is already registered!"
                    });
                }

                // 📸 IMAGE UPLOAD LOGIC
                let finalAvatarUrl = "";

                // ১. যদি সিঙ্গেল ফাইল আপলোড হয় (upload.single('image'))
                if (req.file) {
                    try {
                        // req.file কে অ্যারে বানিয়ে পাঠাচ্ছি [req.file]
                        const uploadedUrls = await uploadToCloudinary([req.file]);
                        if (uploadedUrls && uploadedUrls.length > 0) {
                            finalAvatarUrl = uploadedUrls[0];
                        }
                    } catch (imgErr) {
                        console.error("Cloudinary Upload Error:", imgErr);
                    }
                }

                // ২. যদি গুগল সাইন-ইন বা এক্সটার্নাল ইমেজ URL হয়
                if (!finalAvatarUrl) {
                    if (avatar || req.body.image || req.user?.picture) {
                        finalAvatarUrl = avatar || req.body.image || req.user?.picture;
                    } else {
                        // ৩. কোনোটিই না থাকলে ডিফল্ট প্লেসহোল্ডার
                        finalAvatarUrl = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80";
                    }
                }

                const fullName = `${firstName || ''} ${lastName || ''}`.trim();

                const finalAgentData = {
                    agentId: finalAgentId,
                    name: fullName,
                    firstName: firstName || fullName.split(' ')[0] || "",
                    lastName: lastName || fullName.split(' ').slice(1).join(' ') || "",
                    email: finalEmail,
                    avatar: finalAvatarUrl,
                    authProvider: authProvider || (req.user?.firebase?.sign_in_provider === 'google.com' ? 'google' : 'email'),
                    paymentStatus: 'pending',
                    createdAt: new Date()
                };

                const result = await agentsCollection.insertOne(finalAgentData);

                return res.status(201).send({
                    success: true,
                    message: "Registration successful!",
                    data: { _id: result.insertedId, ...finalAgentData }
                });

            } catch (error) {
                console.error("Error in agent registration API:", error);
                return res.status(500).send({
                    error: true,
                    message: "Internal Server Error"
                });
            }
        });


        // 🚀 POST: /api/bookings
        app.post('/api/bookings', async (req, res) => {
            try {
                const bookingData = req.body;
                const { email, applicantName, contactNo, projectId, agentId } = bookingData;

                // প্রয়োজনীয় ফিল্ড ভ্যালিডেশন
                if (!email) {
                    return res.status(400).json({ success: false, message: "Email is required!" });
                }

                if (!projectId) {
                    return res.status(400).json({ success: false, message: "Project ID is required!" });
                }

                const normalizedEmail = email.toLowerCase().trim();

                // ১. চেক করা ইউজার আগে থেকে আছে কি না
                let user = await usersCollection.findOne({ email: normalizedEmail });
                let autoGeneratedPassword = null;

                if (!user) {
                    // ইউজার না থাকলে নতুন পাসওয়ার্ড জেনারেট করা
                    autoGeneratedPassword = 'pass_' + Math.random().toString(36).slice(-5);
                    const hashedPassword = await bcrypt.hash(autoGeneratedPassword, 10);

                    const newUser = {
                        name: applicantName,
                        email: normalizedEmail,
                        phone: contactNo,
                        password: hashedPassword,
                        role: 'client',
                        createdAt: new Date()
                    };

                    // 'users' কালেকশনে অটো ক্রিয়েট ও ইনসার্ট
                    const userResult = await usersCollection.insertOne(newUser);
                    user = { _id: userResult.insertedId, ...newUser };

                    // নতুন ইউজারকে পাসওয়ার্ড ইমেইল করা
                    try {
                        await transporter.sendMail({
                            from: '"Property Management" <noreply@yourdomain.com>',
                            to: normalizedEmail,
                            subject: 'Your Account Credentials for Property Portal',
                            html: `
                        <h3>Dear ${applicantName},</h3>
                        <p>Thank you for submitting your property booking application.</p>
                        <p>An account has been automatically created for you to track your booking status.</p>
                        <br/>
                        <p><strong>Your Account Login Credentials:</strong></p>
                        <p><strong>Email:</strong> ${normalizedEmail}</p>
                        <p><strong>Password:</strong> <code style="background:#f4f4f4; padding:4px 8px; font-weight:bold;">${autoGeneratedPassword}</code></p>
                        <br/>
                        <p>Please log in to your dashboard to view your booking details and updates.</p>
                    `
                        });
                    } catch (mailError) {
                        console.error("Failed to send email:", mailError);
                    }
                }

                // ২. 🔥 ডুপ্লিকেট বুকিং চেক: ইউজার এই প্রজেক্টটি অলরেডি বুক করেছেন কি না
                const existingBookingQuery = {
                    userId: user._id,
                    $or: [
                        { projectId: projectId },
                        ...(ObjectId.isValid(projectId) ? [{ projectId: new ObjectId(projectId) }] : [])
                    ]
                };

                const existingBooking = await bookingsCollection.findOne(existingBookingQuery);

                if (existingBooking) {
                    return res.status(400).json({
                        success: false,
                        message: "You have already submitted a booking application for this project!"
                    });
                }

                // ৩. বুকিং অবজেক্ট তৈরি
                const newBookingDocument = {
                    ...bookingData,
                    projectId: ObjectId.isValid(projectId) ? new ObjectId(projectId) : projectId,
                    userId: user._id,
                    status: 'pending',
                    agentId: agentId,
                    createdAt: new Date()
                };

                // 'bookings' কালেকশনে ইনসার্ট
                const bookingResult = await bookingsCollection.insertOne(newBookingDocument);

                res.status(201).json({
                    success: true,
                    message: "Booking application submitted successfully!",
                    bookingId: bookingResult.insertedId,
                    accountCreated: !!autoGeneratedPassword
                });

            } catch (error) {
                console.error("Booking API Error:", error);
                res.status(500).json({ success: false, message: "Internal server error during booking." });
            }
        });


        // blogs post api 


        app.post('/api/blogs', upload.single('image'), async (req, res) => {
            try {
                const { title, category, excerpt, content, readTime, author, agentId, tags, socials } = req.body;

                // ১. ব্যাকএন্ড ভ্যালিডেশন
                if (!title || !req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'Title and cover image are required!'
                    });
                }

                // ২. ক্লাউডিনারিতে ইমেজ আপলোড (Memory Buffer handle)
                let imageUrl = '';
                if (req.file) {
                    const uploadResult = await uploadToCloudinary([req.file]); // array তে পাস করা হচ্ছে
                    if (uploadResult.length > 0) {
                        imageUrl = uploadResult[0];
                    }
                }

                // ৩. FormData এর মাধ্যমে পাঠানো Tags (Array) এবং Socials (Object) Parse করা
                let parsedTags = [];
                let parsedSocials = { facebook: '', linkedin: '', pinterest: '', twitter: '' };

                if (tags) {
                    try {
                        parsedTags = JSON.parse(tags);
                    } catch (err) {
                        parsedTags = [];
                    }
                }

                if (socials) {
                    try {
                        parsedSocials = JSON.parse(socials);
                    } catch (err) {
                        parsedSocials = {};
                    }
                }

                // ৪. MongoDB তে সেভ করার জন্য ডকুমেন্ট তৈরি
                const newBlog = {
                    title,
                    category: category || 'Market Insights',
                    excerpt: excerpt || '',
                    content: content || '',
                    readTime: readTime || '5 min read',
                    author: author || 'Admin',
                    img: imageUrl, // Cloudinary Image URL
                    tags: parsedTags, // ['RealEstate', 'Dhaka']
                    agentId: agentId,
                    socials: parsedSocials, // { facebook: '...', linkedin: '...' }
                    createdAt: new Date(),
                    publishedDate: new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'
                };

                // 🗄️ ৫. MongoDB Collection এ ডাটা ইনসার্ট
                const result = await blogsCollection.insertOne(newBlog);

                res.status(201).json({
                    success: true,
                    message: 'Blog published successfully!',
                    blogId: result.insertedId,
                    blog: newBlog
                });

            } catch (error) {
                console.error('Error uploading blog:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload blog to server or Cloudinary.',
                    error: error.message
                });
            }
        });





        app.post('/api/submit-payment', async (req, res) => {
            try {
                const { bookingId, userId, amount, paymentMethod, bankName, transactionId, paymentType, senderName } = req.body;


                // ১. প্রয়োজনীয় ফিল্ড চেক
                if (!bookingId || !userId || !amount || !transactionId || !paymentMethod) {
                    return res.status(400).json({
                        success: false,
                        message: 'All required fields (bookingId, userId, amount, paymentMethod, transactionId) are needed.'
                    });
                }

                // ২. ID গুলো ভ্যালিড MongoDB ObjectId কি না চেক
                if (!ObjectId.isValid(bookingId) || !ObjectId.isValid(userId)) {
                    console.log("Invalid ObjectId passed:", { bookingId, userId });
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid bookingId or userId format.'
                    });
                }

                // ৩. বুকিং ডাটাবেজে উপস্থিত আছে কি না যাচাই
                const bookingExists = await bookingsCollection.findOne({ _id: new ObjectId(bookingId) });
                if (!bookingExists) {
                    return res.status(404).json({
                        success: false,
                        message: 'Target booking was not found.'
                    });
                }

                const formattedTxnId = String(transactionId).trim();
                const numericAmount = Number(amount);

                if (isNaN(numericAmount) || numericAmount <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Payment amount must be a positive number.'
                    });
                }

                // ৪. Transaction ID ডুপ্লিকেট চেক (Case-Insensitive)
                const existingTxn = await transactionsCollection.findOne({
                    transactionId: { $regex: new RegExp(`^${formattedTxnId}$`, 'i') }
                });

                if (existingTxn) {
                    return res.status(400).json({
                        success: false,
                        message: 'Transaction ID already exists!'
                    });
                }

                // ৫. নতুন অবজেক্ট তৈরি
                const newTransaction = {
                    bookingId: new ObjectId(bookingId),
                    userId: new ObjectId(userId),
                    amount: numericAmount,
                    paymentType: paymentType,
                    senderName: senderName,
                    paymentMethod: String(paymentMethod).trim(),
                    bankName: bankName ? String(bankName).trim() : 'N/A',
                    transactionId: formattedTxnId,
                    status: 'pending',
                    createdAt: new Date()
                };

                // ৬. Transactions Collection এ ইনসার্ট
                const txnResult = await transactionsCollection.insertOne(newTransaction);

                // ৭. Bookings Collection আপডেট (Transaction ID Reference push করা)
                await bookingsCollection.updateOne(
                    { _id: new ObjectId(bookingId) },
                    { $push: { transactions: txnResult.insertedId } }
                );

                res.status(201).json({
                    success: true,
                    message: 'Payment request submitted successfully. Pending verification.',
                    data: { _id: txnResult.insertedId, ...newTransaction }
                });

            } catch (error) {
                console.error("Error in /api/submit-payment:", error);
                res.status(500).json({ success: false, message: error.message });
            }
        });




        // ==========================================
        // ৩. এডমিন প্যানেল: Approve / Reject করার API
        // ==========================================
        app.patch('/api/admin/update-payment-status/:txnId', async (req, res) => {
            try {
                const { txnId } = req.params;
                const { status } = req.body; // 'approved' অথবা 'rejected'

                // ১. ইনপুট ও ObjectId ভ্যালিডেশন
                if (!['approved', 'rejected'].includes(status)) {
                    return res.status(400).json({ success: false, message: 'Invalid status value.' });
                }

                if (!ObjectId.isValid(txnId)) {
                    return res.status(400).json({ success: false, message: 'Invalid Transaction ID format.' });
                }

                // ২. Transaction টি খুঁজে বের করা
                const transaction = await transactionsCollection.findOne({ _id: new ObjectId(txnId) });

                if (!transaction) {
                    return res.status(404).json({ success: false, message: 'Transaction not found.' });
                }

                // যদি স্ট্যাটাস ইতিমধ্যেই একই থাকে তবে রিডান্ড্যান্ট অপারেশন এড়ানো
                if (transaction.status === status) {
                    return res.status(400).json({
                        success: false,
                        message: `Transaction is already marked as ${status}.`
                    });
                }

                const previousStatus = transaction.status;
                const amount = Number(transaction.amount) || 0;

                // ৩. Transaction এর স্ট্যাটাস আপডেট করা
                await transactionsCollection.updateOne(
                    { _id: new ObjectId(txnId) },
                    { $set: { status: status, updatedAt: new Date() } }
                );

                // ৪. Booking ও Project আপডেট হ্যান্ডলিং
                if (transaction.bookingId && ObjectId.isValid(transaction.bookingId)) {
                    const booking = await bookingsCollection.findOne({ _id: new ObjectId(transaction.bookingId) });

                    if (booking) {
                        let paidIncrement = 0;
                        let shareIncrement = 0;

                        // Case A: Pending/Rejected -> Approved (পেমেন্ট যোগ হবে)
                        if (status === 'approved' && previousStatus !== 'approved') {
                            paidIncrement = amount;
                            shareIncrement = 1;
                        }
                        // Case B: Approved -> Rejected (আগের পেমেন্ট রিভার্স/বিয়োগ হবে)
                        else if (status === 'rejected' && previousStatus === 'approved') {
                            paidIncrement = -amount;
                            shareIncrement = -1;
                        }

                        // ৪.১ Bookings Collection আপডেট (totalPaid ও totalDue সিঙ্ক)
                        if (paidIncrement !== 0) {
                            const currentTotalPaid = Number(booking.totalPaid) || 0;
                            const newTotalPaid = Math.max(0, currentTotalPaid + paidIncrement);
                            const totalAmount = Number(booking.totalAmount) || 0;
                            const newTotalDue = Math.max(0, totalAmount - newTotalPaid);

                            await bookingsCollection.updateOne(
                                { _id: new ObjectId(transaction.bookingId) },
                                {
                                    $set: {
                                        totalPaid: newTotalPaid,
                                        totalDue: newTotalDue,
                                        updatedAt: new Date()
                                    }
                                }
                            );
                        }

                        // ৪.২ Projects Collection-এ totalShare সিঙ্ক
                        if (shareIncrement !== 0 && booking.projectId && ObjectId.isValid(booking.projectId)) {
                            await projectsCollection.updateOne(
                                { _id: new ObjectId(booking.projectId) },
                                { $inc: { totalShares: shareIncrement } }
                            );
                        }
                    }
                }

                res.status(200).json({
                    success: true,
                    message: `Transaction status updated to '${status}' successfully.`,
                    data: { txnId, status }
                });

            } catch (error) {
                console.error("Error in /api/admin/update-payment-status:", error);
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // -------------------------Stripe checkout session ----------------------

        //         app.post('/create-checkout-session', async (req, res) => {
        //     try {
        //         const paymentInfo = req.body;
        //         // console.log(paymentInfo);

        //         const price = parseInt(paymentInfo.planDetails.price) * 100;

        //         // 1. Calculate Start Date & End Date
        //         const startDate = paymentInfo.createdAt ? new Date(paymentInfo.createdAt) : new Date();
        //         const endDate = new Date(startDate);

        //         // Plan Duration (monthly/yearly) base kore End Date set
        //         if (paymentInfo.planDetails.duration === 'yearly') {
        //             endDate.setFullYear(endDate.getFullYear() + 1);
        //         } else {
        //             // Default 1 Month Add
        //             endDate.setMonth(endDate.getMonth() + 1);
        //         }

        //         // 2. Set Property Limits based on plan (Need customized rules if plans vary)
        //         const propertyLimit = paymentInfo.planDetails.limits.listings || 10; 

        //         const session = await stripe.checkout.sessions.create({
        //             ui_mode: "hosted_page",
        //             line_items: [
        //                 {
        //                     price_data: {
        //                         currency: 'USD',
        //                         unit_amount: price,
        //                         product_data: {
        //                             name: paymentInfo.planDetails.planName
        //                         },
        //                     },
        //                     quantity: 1,
        //                 },
        //             ],
        //             customer_email: paymentInfo.customer.senderEmail,
        //             mode: 'payment',
        //             metadata: {
        //                 agentName: paymentInfo.customer.fullName || '',
        //                 agencyName: paymentInfo.customer.agencyName || '',
        //                 whatsappNumber: paymentInfo.customer.whatsappNumber || '',
        //                 senderEmail: paymentInfo.customer.senderEmail || '',
        //                 subdomain: paymentInfo.domainConfig.customUsername || '',
        //                 planName: paymentInfo.planDetails.planName || '',
        //                 targetAddress: paymentInfo.domainConfig.targetAddress || '',
        //                 planPrice: paymentInfo.planDetails.price ? paymentInfo.planDetails.price.toString() : '0',
        //                 planDuration: paymentInfo.planDetails.duration || 'monthly',
        //                 startDate: startDate.toISOString(),
        //                 endDate: endDate.toISOString(),            
        //                 propertyLimit: propertyLimit.toString(),   
        //                 listedProperty: '0'                         
        //             },
        //             success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        //             cancel_url: `${process.env.SITE_DOMAIN}/payment-canclled`,
        //         });

        //         console.log(session);

        //         // Response sending single JSON object
        //         res.send({ url: session.url });

        //     } catch (error) {
        //         console.error("Stripe Checkout Error:", error);
        //         res.status(500).send({ error: error.message });
        //     }
        // });



        // ---------------------------SSL Commerz Payment Setup---------------------- 

        app.post('/create-checkout-session', async (req, res) => {
            try {
                const paymentInfo = req.body;
                const agentEmail = paymentInfo.customer?.senderEmail;

                if (!agentEmail) {
                    return res.status(400).send({ error: true, message: "Agent email is required." });
                }

                // 🔒 VALIDATION 1: Check Active Subscription in Agents Collection
                const existingAgent = await agentsCollection.findOne({ email: agentEmail });

                if (existingAgent && existingAgent.paymentStatus === 'paid' && existingAgent.metadata?.endDate) {
                    const currentDate = new Date();
                    const planEndDate = new Date(existingAgent.metadata.endDate);

                    if (planEndDate > currentDate) {
                        return res.status(400).send({
                            error: true,
                            activePlan: true,
                            message: `Apnar ekti active plan chaluk ache ja ${planEndDate.toLocaleDateString()} porjonto meyadi. Meyadh sesh hobar aage notun plan purchase kora jabe na.`
                        });
                    }
                }

                // -------------------------------------------------------------
                // Payment Payload & Dates Setup
                // -------------------------------------------------------------
                const totalAmount = parseFloat(paymentInfo.planDetails?.price || 0);
                const tran_id = `TRAN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                const startDate = new Date();
                const endDate = new Date(startDate);

                if (paymentInfo.planDetails?.duration === 'yearly') {
                    endDate.setFullYear(endDate.getFullYear() + 1);
                } else {
                    endDate.setMonth(endDate.getMonth() + 1);
                }

                const propertyLimit = paymentInfo.planDetails?.limits?.listings || 10;

                const customMetadata = {
                    agencyName: paymentInfo.customer?.agencyName || '',
                    agentName: paymentInfo.customer?.fullName || '',
                    senderEmail: agentEmail,
                    whatsappNumber: paymentInfo.customer?.whatsappNumber || '',
                    subdomain: paymentInfo.domainConfig?.customUsername || '',
                    targetAddress: paymentInfo.domainConfig?.targetAddress || '',
                    planName: paymentInfo.planDetails?.planName || '',
                    planPrice: paymentInfo.planDetails?.price ? paymentInfo.planDetails.price.toString() : '0',
                    planDuration: paymentInfo.planDetails?.duration || 'monthly',
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    propertyLimit: propertyLimit.toString(),
                    listedProperty: '0'
                };

                // -------------------------------------------------------------
                // 📦 Subscriptions Collection-e Entry (Initial Status: 'pending')
                // -------------------------------------------------------------
                const subscriptionDoc = {
                    tran_id: tran_id,
                    agentEmail: agentEmail,
                    amount: totalAmount,
                    paymentStatus: 'pending', // SSLCommerz-e jawar aage pending
                    planDetails: paymentInfo.planDetails,
                    customerDetails: paymentInfo.customer,
                    domainConfig: paymentInfo.domainConfig,
                    metadata: customMetadata,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // Subscription Collection-e insert korbe
                await subscriptionsCollection.insertOne(subscriptionDoc);

                // -------------------------------------------------------------
                // SSLCommerz Payload Setup
                // -------------------------------------------------------------
                const data = {
                    total_amount: totalAmount,
                    currency: 'BDT',
                    tran_id: tran_id,
                    success_url: `${process.env.SITE_DOMAIN}/api/payment-success?tran_id=${tran_id}`,
                    fail_url: `${process.env.SITE_DOMAIN}/api/payment-fail?tran_id=${tran_id}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/api/payment-cancel?tran_id=${tran_id}`,
                    ipn_url: `${process.env.SITE_DOMAIN}/api/payment-ipn`,

                    shipping_method: 'NO',
                    product_name: paymentInfo.planDetails?.planName || 'Agent Plan Subscription',
                    product_category: 'Digital Service',
                    product_profile: 'non-physical-goods',

                    cus_name: paymentInfo.customer?.fullName || 'Valued Agent',
                    cus_email: agentEmail,
                    cus_add1: paymentInfo.customer?.agencyName || 'Dhaka',
                    cus_add2: 'Dhaka',
                    cus_city: 'Dhaka',
                    cus_state: 'Dhaka',
                    cus_postcode: '1000',
                    cus_country: 'Bangladesh',
                    cus_phone: paymentInfo.customer?.whatsappNumber || '01700000000',
                    cus_fax: paymentInfo.customer?.whatsappNumber || '01700000000',

                    ship_name: paymentInfo.customer?.fullName || 'Valued Agent',
                    ship_add1: 'Dhaka',
                    ship_add2: 'Dhaka',
                    ship_city: 'Dhaka',
                    ship_state: 'Dhaka',
                    ship_postcode: 1000,
                    ship_country: 'Bangladesh',

                    value_a: tran_id // value_a te just tran_id rekhe dilam
                };

                const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);

                sslcz.init(data).then(apiResponse => {
                    let GatewayPageURL = apiResponse.GatewayPageURL;

                    if (GatewayPageURL) {
                        res.status(200).send({ url: GatewayPageURL });
                    } else {
                        res.status(400).send({ error: true, message: "SSLCommerz Gateway URL generation failed." });
                    }
                });

            } catch (error) {
                console.error("SSLCommerz Payment Init Error:", error);
                res.status(500).send({ error: true, message: error.message || "Internal Server Error" });
            }
        });


        // create plan renewal  api  


        app.post('/create-renew-session', async (req, res) => {
            try {
                const { planDetails } = req.body;
                console.log(planDetails);
                const agentEmail = planDetails?.senderEmail;

                if (!agentEmail) {
                    return res.status(400).send({ error: true, message: "Agent email is required." });
                }

                const totalAmount = parseFloat(planDetails?.price || 0);
                const new_tran_id = `RENEW_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                const renewalInfo = {
                    renewal_id: new_tran_id,
                    planDetails: planDetails,
                    renewalStatus: false
                };

                await subscriptionsCollection.insertOne(renewalInfo);

                // 📌 SSLCommerz Payload Setup
                const data = {
                    total_amount: totalAmount,
                    currency: 'BDT',
                    tran_id: new_tran_id,
                    success_url: `${process.env.SITE_DOMAIN}/api/renewal-success?tran_id=${new_tran_id}`,
                    fail_url: `${process.env.SITE_DOMAIN}/api/payment-fail?tran_id=${new_tran_id}`,
                    cancel_url: `${process.env.SITE_DOMAIN}/api/payment-cancel?tran_id=${new_tran_id}`,
                    ipn_url: `${process.env.SITE_DOMAIN}/api/payment-ipn`,

                    shipping_method: 'NO',
                    product_name: `Renewal: ${planDetails?.planName || 'Agent Plan'}`,
                    product_category: 'Digital Service',
                    product_profile: 'non-physical-goods',

                    cus_name: 'Valued Agent',
                    cus_email: agentEmail,
                    cus_add1: 'Dhaka',
                    cus_city: 'Dhaka',
                    cus_postcode: '1000',
                    cus_country: 'Bangladesh',
                    cus_phone: '01700000000',


                };

                const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);

                sslcz.init(data).then(apiResponse => {
                    let GatewayPageURL = apiResponse.GatewayPageURL;

                    if (GatewayPageURL) {
                        res.status(200).send({ url: GatewayPageURL });
                    } else {
                        res.status(400).send({ error: true, message: "SSLCommerz Gateway URL generation failed." });
                    }
                });

            } catch (error) {
                console.error("Renewal Init Error:", error);
                res.status(500).send({ error: true, message: error.message || "Internal Server Error" });
            }
        });



        //    ssl commerz payment success 

        app.post('/api/payment-success', async (req, res) => {
            try {
                const tran_id = req.query.tran_id || req.body.tran_id;

                if (!tran_id) {
                    return res.redirect(`${process.env.FRONTEND_DOMAIN}/payment-fail?message=Transaction ID missing`);
                }

                // 📌 Step 1: Subscriptions Collection theke tran_id diye data khuje ber kora
                const subscription = await subscriptionsCollection.findOne({ tran_id: tran_id });

                if (!subscription) {
                    return res.redirect(`${process.env.FRONTEND_DOMAIN}/payment-fail?message=Subscription record not found`);
                }

                const { agentEmail, metadata } = subscription;

                // 📌 Step 2: Subscriptions Collection-e paymentStatus 'paid' kora
                await subscriptionsCollection.updateOne(
                    { tran_id: tran_id },
                    {
                        $set: {
                            paymentStatus: 'paid',
                            updatedAt: new Date()
                        }
                    }
                );

                // 📌 Step 3: Agent Collection-e status 'paid' & Metadata Merge/Update kora
                await agentsCollection.updateOne(
                    { email: agentEmail },
                    {
                        $set: {
                            paymentStatus: 'paid',
                            subscriptionTranId: tran_id,
                            metadata: metadata,
                            updatedAt: new Date()
                        }
                    },
                    { upsert: true } // Agent db te na thakle new agent document toiri hoye jabe
                );

                // 📌 Step 4: Success page-e Frontend-e redirect kora
                return res.redirect(`${process.env.FRONTEND_DOMAIN}/payment-success?tran_id=${tran_id}`);

            } catch (error) {
                console.error("Payment Success Handler Error:", error);
                return res.redirect(`${process.env.FRONTEND_DOMAIN}/payment-fail?message=Internal Server Error`);
            }
        });



        // renewal success api 


        app.post('/api/renewal-success', async (req, res) => {
            try {
                const tran_id = req.query.tran_id || req.body.tran_id;
                console.log(tran_id);

                if (!tran_id) {
                    return res.redirect(`${process.env.FRONTEND_DOMAIN}/payment-fail?message=Transaction ID missing`);
                }


                const renewalInfo = await subscriptionsCollection.findOne({ renewal_id: tran_id });

                const senderEmail = renewalInfo.planDetails.senderEmail;



                // 📌 Step 1: Subscriptions Collection theke tran_id diye data khuje ber kora
                const subscription = await subscriptionsCollection.findOne({ agentEmail: senderEmail });
                console.log('renewal data :', renewalInfo, 'subscription data :', subscription);

                if (!subscription) {
                    return res.redirect(`${process.env.FRONTEND_DOMAIN}/payment-fail?message=Subscription record not found`);
                }

                const duration = renewalInfo.planDetails.duration; // 'monthly' অথবা 'yearly'
                const currentEndDateInDB = subscription?.metadata?.endDate; // ডাটাবেজে থাকা বর্তমান মেয়াদ

                // ফাংশন কল করে নতুন তারিখ দুটো বের করে নেওয়া
                const { startDate, endDate } = calculateSubscriptionDates(currentEndDateInDB, duration);

                // 📌 Step 2: Subscriptions Collection-e paymentStatus 'paid' kora
                await subscriptionsCollection.updateOne(
                    { agentEmail: senderEmail },
                    {
                        $set: {
                            amount: renewalInfo.planDetails.price,
                            'planDetails.planId': renewalInfo.planDetails.planId,
                            'planDetails.planName': renewalInfo.planDetails.planName,
                            'planDetails.price': renewalInfo.planDetails.price,
                            'planDetails.duration': renewalInfo.planDetails.duration,
                            'planDetails.limits.listings': renewalInfo.planDetails.limits.listings,
                            'metadata.planName': renewalInfo.planDetails.planName,
                            'metadata.planPrice': renewalInfo.planDetails.planPrice,
                            'metadata.planDuration': renewalInfo.planDetails.duration,
                            'metadata.startDate': startDate,
                            'metadata.endDate': endDate,
                            'metadata.propertyLimit': renewalInfo.planDetails.limits.listings,



                        }
                    }
                );

                // 📌 Step 3: Agent Collection-e status 'paid' & Metadata Merge/Update kora
                // await agentsCollection.updateOne(
                //     { email: agentEmail },
                //     {
                //         $set: {
                //             paymentStatus: 'paid',
                //             subscriptionTranId: tran_id,
                //             metadata: metadata,
                //             updatedAt: new Date()
                //         }
                //     },
                //     { upsert: true } // Agent db te na thakle new agent document toiri hoye jabe
                // );

                // 📌 Step 4: Success page-e Frontend-e redirect kora
                return res.redirect(`${process.env.FRONTEND_DOMAIN}`);

            } catch (error) {
                console.error("Payment Success Handler Error:", error);
                return res.redirect(`${process.env.FRONTEND_DOMAIN}/payment-fail?message=Internal Server Error`);
            }
        });


        // ------------------------------------------------------------------
        // 🔑 Login API: POST /api/login
        // ------------------------------------------------------------------
        app.post('/api/login', async (req, res) => {
            try {
                const { email, password } = req.body;

                // ১. ইনপুট ভ্যালিডেশন
                if (!email || !password) {
                    return res.status(400).json({
                        success: false,
                        message: 'Email and password are required!'
                    });
                }

                // ২. Native MongoDB কালেকশন থেকে ইমেইল অনুযায়ী ইউজার খোঁজা
                const user = await usersCollection.findOne({ email: email });
                if (!user) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid email or password!'
                    });
                }

                // ৩. পাসওয়ার্ড ভ্যালিডেশন 
                // (যদি রেজিস্ট্রেশনের সময় bcrypt দিয়ে হ্যাশ করে থাকেন)
                const isPasswordValid = await bcrypt.compare(password, user.password);

                // ⚠️ নোট: আপনি যদি ডাটাবেজে প্লেন টেক্সট (Plain Text) পাসওয়ার্ড সেভ করে থাকেন, 
                // তবে উপরের চেনের বদলে নিচের কমেন্ট করা লাইনটি ব্যবহার করতে পারেন:
                // const isPasswordValid = (user.password === password);

                if (!isPasswordValid) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid email or password!'
                    });
                }

                // ৪. JWT টোকেন তৈরি করা
                const token = jwt.sign(
                    {
                        id: user._id,
                        email: user.email,
                        role: 'client'
                    },
                    process.env.JWT_SECRET || 'secret_key_123',
                    { expiresIn: '7d' }
                );

                // ৫. পাসওয়ার্ড বাদ দিয়ে ইউজার ডাটা প্রস্তুত করা
                const userData = {
                    _id: user._id,
                    name: user.name || user.fullName || 'User',
                    email: user.email,
                    role: 'client'
                };

                return res.status(200).json({
                    success: true,
                    message: 'Login successful!',
                    token,
                    user: userData
                });

            } catch (error) {
                console.error('Login API Error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Server error during login. Please try again.'
                });
            }
        });






        // ২. কন্টাক্ট এজেন্ট এপিআই এন্ডপয়েন্ট for email service

        app.post('/api/contact-agent', async (req, res) => {
            try {
                const {
                    propertyId,       // 👈 প্রোপার্টি আইডি
                    userName,
                    userEmail,
                    userPhone,
                    userMessage,
                    subject,          // Contact page-এর জন্য
                    agentEmail,
                    agencyName,
                    propertyTitle,
                    propertyPrice,
                    propertyLink
                } = req.body;


                // ডাটা ভ্যালিডেশন
                if (!userEmail || !userMessage) {
                    return res.status(400).send({ success: false, message: "Email and message are required." });
                }

                let mailOptions;

                // 🔀 condition: propertyId থাকলে এজেন্টের কাছে যাবে, না থাকলে এডমিনের কাছে
                if (propertyId) {

                    // 🏠 ১. এজেন্টের জন্য মেইলের খাম (Agent Email Template)
                    mailOptions = {
                        from: `"PrimeState Portal" <${process.env.EMAIL_USER}>`,
                        to: agentEmail,       // এজেন্টের পার্সোনাল মেইলে যাবে
                        replyTo: userEmail,   // রিপ্লাই দিলে সরাসরি ক্লায়েন্টের কাছে যাবে
                        subject: `🔥 New Lead for "${propertyTitle}" - PrimeState`,
                        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">Hello ${agencyName || 'Agent'},</h2>
          <p style="font-size: 16px;">You have received a new customer inquiry for one of your listed properties on PrimeState.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #0f766e; margin-top: 0;">🏠 Property Details</h3>
            <p style="margin: 5px 0;"><strong>Title:</strong> ${propertyTitle}</p>
            <p style="margin: 5px 0;"><strong>Price:</strong> ${propertyPrice}</p>
            <p style="margin: 15px 0 0 0;"><a href="${propertyLink}" target="_blank" style="background-color: #1e3a8a; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;">View Listed Property</a></p>
          </div>
          
          <div style="background-color: #fff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #1e3a8a; margin-top: 0;">👤 Client Information</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${userName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${userEmail}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${userPhone || 'Not provided'}</p>
            <p style="margin: 10px 0 0 0;"><strong>Client Message:</strong></p>
            <blockquote style="background: #f1f5f9; padding: 12px; border-left: 4px solid #1e3a8a; margin: 5px 0; font-style: italic;">
              "${userMessage}"
            </blockquote>
          </div>
          
          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            This is an automated email from PrimeState System. Please hit "Reply" to contact the client directly.
          </p>
        </div>
      `
                    };

                } else {

                    // 📩 ২. কন্টাক্ট পেজের নরমাল মেসেজের জন্য মেইলের খাম (Contact Form Email Template)
                    mailOptions = {
                        from: `"PrimeState Portal" <${process.env.EMAIL_USER}>`,
                        to: agentEmail,   // এডমিনের নিজস্ব মেইলে যাবে
                        replyTo: userEmail,           // রিপ্লাই দিলে সরাসরি ইউজারের কাছে যাবে
                        subject: `📩 Contact Form Message: ${subject || 'New Message'}`,
                        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #0b4d34; border-bottom: 2px solid #0b4d34; padding-bottom: 10px;">New Message from Contact Us Page</h2>
          <p style="font-size: 15px;">You have received a new contact submission from your website.</p>
          
          <div style="background-color: #fff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #0b4d34; margin-top: 0;">👤 Sender Details</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${userName || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${userEmail}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${userPhone || 'Not provided'}</p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
            <p style="margin: 10px 0 0 0;"><strong>Message:</strong></p>
            <blockquote style="background: #f1f5f9; padding: 12px; border-left: 4px solid #0b4d34; margin: 5px 0; font-style: italic;">
              "${userMessage}"
            </blockquote>
          </div>
          
          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            This is an automated email from PrimeState Contact Form. Hit "Reply" to respond directly to the sender.
          </p>
        </div>
      `
                    };

                }

                // ✉️ মেইল সেন্ড করা
                await transporter.sendMail(mailOptions);

                res.status(200).send({
                    success: true,
                    message: propertyId ? "Email sent to agent successfully!" : "Contact message sent successfully!"
                });

            } catch (error) {
                console.error("Nodemailer Error:", error);
                res.status(500).send({ success: false, message: "Internal server error while sending email." });
            }
        });


        // posting the team member data 

        app.post('/api/admin/team-members',
            upload.single('image'),
            async (req, res) => {
                try {
                    const { name, designation, bio, facebook, linkedin, agentId } = req.body;

                    // ১. ফর্ম ভ্যালিডেশন চেক
                    if (!name || !designation || !bio) {
                        return res.status(400).json({
                            success: false,
                            message: 'Name, designation, and bio are required fields.',
                        });
                    }

                    // ২. ছবি আপলোড হয়েছে কিনা চেক করা
                    if (!req.file) {
                        return res.status(400).json({
                            success: false,
                            message: 'Please upload a profile image for the team member.',
                        });
                    }

                    // ৩. ক্লাউডিনারিতে আপলোড প্রসেসিং
                    // (আপনার ইউটিলিটি ফাংশন `uploadToCloudinary` অ্যারে গ্রহণ করে, তাই ফাইলটিকে অ্যারে আকারে পাঠানো হচ্ছে)
                    const uploadedImages = await uploadToCloudinary([req.file]);
                    const imageUrl = uploadedImages[0]; // প্রথম আপলোড হওয়া ছবির URL

                    // ৪. ডাটাবেজে সেভ করার জন্য অবজেক্ট রেডি করা
                    const newMember = {
                        name,
                        designation,
                        bio,
                        facebook: facebook || '',
                        linkedin: linkedin || '',
                        imageUrl,
                        agentId,
                        createdAt: new Date(),
                    };

                    // ৫. MongoDB-র membersCollection-এ ডাটা ইনসার্ট করা
                    const result = await membersCollection.insertOne(newMember);

                    // ০০০. রেসপন্স পাঠানো
                    res.status(201).json({
                        success: true,
                        message: 'Team member added successfully!',
                        data: {
                            _id: result.insertedId,
                            ...newMember,
                        },
                    });

                } catch (error) {
                    console.error('Error adding team member:', error);
                    res.status(500).json({
                        success: false,
                        message: 'Internal Server Error. Failed to add team member.',
                        error: error.message,
                    });
                }
            }
        );




        // add setting data 

        app.post('/settings', settingsUploadMiddleware, async (req, res) => {
            try {

                const settingsData = { ...req.body };


                if (req.files && req.files['logo']) {
                    const logoFile = req.files['logo'];
                    const logoUrlResult = await uploadToCloudinary(logoFile);
                    if (logoUrlResult.length > 0) {
                        settingsData.logo = logoUrlResult[0];
                    }
                }


                if (req.files && req.files['favIcon']) {
                    const favIconFile = req.files['favIcon'];
                    const favIconUrlResult = await uploadToCloudinary(favIconFile);
                    if (favIconUrlResult.length > 0) {
                        settingsData.favIcon = favIconUrlResult[0];
                    }
                }





                const result = await settingsCollection.insertOne(settingsData);

                res.status(200).send({
                    success: true,
                    message: "Settings successfully saved with Cloudinary links!",
                    data: result
                });

            } catch (error) {
                console.error("Backend Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });


        // add slider data 

        // 🚀 POST: স্লাইডার ক্রিয়েট API (Cloudinary Integration সহ)
        app.post('/slider', upload.single('photo'), async (req, res) => {
            try {
                const { headerTitle, title, description, position, domain, agentId } = req.body;
                let photoUrl = '';

                // যদি ফ্রন্টএন্ড থেকে ফাইল আসে, ক্লাউডিনারিতে আপলোড হবে
                if (req.file) {
                    const uploadedUrls = await uploadToCloudinary([req.file]);
                    if (uploadedUrls.length > 0) {
                        photoUrl = uploadedUrls[0];
                    }
                }

                // ডেটাবেজে সেভ করার অবজেক্ট
                const sliderData = {
                    headerTitle,
                    title,
                    description,
                    position,
                    domain: req.body.domain,
                    agentId,
                    photo: photoUrl, // ক্লাউডিনারির Image URL
                    createdAt: new Date()
                };


                const result = await slidersCollection.insertOne(sliderData);
                res.status(201).send(result);

            } catch (error) {
                console.error("Error creating slider:", error);
                res.status(500).send({ message: "Failed to upload and save slider", error: error.message });
            }
        });


        //   update/patch apis 


        // update the projects data 

        app.patch('/projects', async (req, res) => {
            const id = req.query.id;
            const domain = req.query.domain
            const query = { domain: domain, _id: new ObjectId(id) };
            const updatedData = req.body;
            const update = {
                $set: updatedData

            }
            const options = {};
            const result = await projectsCollection.updateOne(query, update, options);
            res.send(result);

        })



        app.patch('/session-status', async (req, res) => {
            try {
                const { sessionId } = req.query;

                if (!sessionId) {
                    return res.status(400).send({ error: true, message: "Session ID is required" });
                }

                // ১. Stripe থেকে Checkout Session ফেচ করা
                const session = await stripe.checkout.sessions.retrieve(sessionId);

                // ২. পেমেন্ট সফল হয়েছে কিনা চেক করা
                if (session.payment_status === 'paid') {
                    const metadata = session.metadata || {};
                    const senderEmail = metadata.senderEmail; // Stripe metadata থেকে ইমেইল আনা

                    if (senderEmail) {
                        // ৩. MongoDB-তে email matches senderEmail কন্ডিশনে updateOne চালানো
                        await agentsCollection.updateOne(
                            { email: senderEmail }, // কোয়েরি ম্যাচিং
                            {
                                $set: {
                                    metadata: metadata, // আগের ডাটার সাথে metadata অবজেক্ট অ্যাড বা আপডেট করা
                                    paymentStatus: 'paid',
                                    updatedAt: new Date()
                                }
                            }
                        );
                    }
                }

                // ৪. ফ্রন্টএন্ডে metadata রিটার্ন করা
                res.status(200).send(session.metadata);

            } catch (error) {
                console.error("Error updating session status:", error);
                res.status(500).send({ error: true, message: error.message });
            }
        });









        // update the settings

        app.patch('/settings', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const updatedData = req.body;
            const update = {
                $set: updatedData

            }
            const options = {};
            const result = await settingsCollection.updateOne(query, update, options);
            res.send(result);

        })

        // update any slider data 
        app.put('/slider/:id', upload.single('photo'), async (req, res) => {
            try {
                const { id } = req.params;
                const updatedData = req.body;

                if (!id) {
                    return res.status(400).send({ message: "ID is required" });
                }

                const query = { _id: new ObjectId(id) };

                const updateDoc = {
                    $set: {
                        headerTitle: updatedData.headerTitle,
                        title: updatedData.title,
                        description: updatedData.description,
                        position: updatedData.position,
                        domain: updatedData.domain,
                    }
                };

                // 🟢 ২. নতুন ছবি আপলোড হলে Cloudinary-তে পাঠাবো
                if (req.file) {
                    // uploadToCloudinary অ্যারে (array) আশা করে, তাই [req.file] পাঠানো হয়েছে
                    const uploadedUrls = await uploadToCloudinary([req.file]);

                    if (uploadedUrls.length > 0) {
                        // Cloudinary-র দেওয়া সিউকিওর (HTTPS) ইমেজ URL ডাটাবেজে সেভ হবে
                        updateDoc.$set.photo = uploadedUrls[0];
                    }
                }

                // ৩. ডাটাবেজে আপডেট
                const result = await slidersCollection.updateOne(query, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "Slider not found" });
                }

                // ৪. ডাটাবেজ থেকে আপডেট হওয়া সর্বশেষ ডাটা রেসপন্স পাঠানো
                const updatedSlider = await slidersCollection.findOne(query);

                res.status(200).send(updatedSlider);

            } catch (error) {
                console.error("Error updating slider:", error);
                res.status(500).send({ message: "Failed to update slider", error: error.message });
            }
        });



        //   delete apis here 


        // delete any project 

        app.delete('/projects/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await projectsCollection.deleteOne(query);
            res.send(result);
        })




        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}
connectToMongoDB();






app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})