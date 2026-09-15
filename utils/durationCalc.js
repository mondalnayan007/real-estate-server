// startDate এবং endDate ক্যালকুলেশন ফাংশন
 function calculateSubscriptionDates(currentEndDateFromDB, duration) {
    const currentDate = new Date();

    // ১. আগের endDate থাকলে সেটি পার্স করা, না থাকলে আজকের তারিখ ধরা
    const existingEndDate = currentEndDateFromDB ? new Date(currentEndDateFromDB) : null;

    // ২. যদি আগের মেয়াদের মেয়াদ এখনও বাকি থাকে (existingEndDate > currentDate) 
    // তবে সেই তারিখ থেকে নতুন মেয়াদ যোগ হবে, আর মেয়াদ শেষ হয়ে থাকলে আজকের তারিখ থেকে শুরু হবে।
    const baseStartDate = (existingEndDate && existingEndDate > currentDate) 
        ? existingEndDate 
        : currentDate;

    // ৩. startDate (যেদিন থেকে নতুন সাইকেল কার্যকর হচ্ছে)
    const startDate = baseStartDate.toISOString();

    // ৪. endDate ক্যালকুলেশন
    const calculatedEndDate = new Date(baseStartDate);

    if (duration === 'yearly') {
        calculatedEndDate.setFullYear(calculatedEndDate.getFullYear() + 1);
    } else {
        // default: monthly (১ মাস যোগ)
        calculatedEndDate.setMonth(calculatedEndDate.getMonth() + 1);
    }

    const endDate = calculatedEndDate.toISOString();

    return { startDate, endDate };
}
module.exports = { calculateSubscriptionDates };