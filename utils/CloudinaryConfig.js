const { v2: cloudinary } = require('cloudinary');
const dotenv = require('dotenv');
const multer = require('multer');

dotenv.config();

// ক্লাউডিনারি কনফিগারেশন
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// মাল্টার মেমোরি স্টোরেজ সেটআপ
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const settingsUploadMiddleware = upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "favIcon", maxCount: 1 }
]);

// ইমেজের নাম ফ্রন্টএন্ডে 'images' দেওয়া, তাই এটি মিডলওয়্যার হিসেবে কাজ করবে
const uploadImagesMiddleware = upload.array('images');

// ক্লাউডিনারিতে আপলোড করার মূল ইউটিলিটি ফাংশন
const uploadToCloudinary = async (files) => {
  const imageUrls = [];
  
  if (!files || files.length === 0) return imageUrls;

  for (const file of files) {
    const b64 = Buffer.from(file.buffer).toString("base64");
    let dataURI = "data:" + file.mimetype + ";base64," + b64;
    
    const uploadResponse = await cloudinary.uploader.upload(dataURI, {
      folder: "real_estate_projects", 
    });
    
    imageUrls.push(uploadResponse.secure_url);
  }

  return imageUrls;
};

// require স্টাইলে এক্সপোর্ট করার নিয়ম
module.exports = {
  upload,
  uploadImagesMiddleware,
  uploadToCloudinary,
  settingsUploadMiddleware
};