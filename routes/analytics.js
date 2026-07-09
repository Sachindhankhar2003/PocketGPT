const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET /api/analytics/stats
// @desc    Get per-user stats for the Dashboard (auth required)
router.get('/stats', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id });
    let totalMessages = 0;
    chats.forEach((chat) => {
      totalMessages += chat.messages.length;
    });

    const user = await User.findById(req.user.id).select('totalDocsUploaded');

    res.json({
      totalChats: chats.length,
      totalMessages,
      docsUploaded: user?.totalDocsUploaded || 0,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/analytics
// @desc    Get global platform stats (auth required)
router.get('/', auth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    const chats = await Chat.find();
    let totalMessages = 0;
    chats.forEach((chat) => {
      totalMessages += chat.messages.length;
    });

    const totalConversations = chats.length;
    const avgMessagesPerConversation =
      totalConversations > 0
        ? parseFloat((totalMessages / totalConversations).toFixed(2))
        : 0;

    res.json({
      totalUsers,
      activeUsers,
      totalMessages,
      totalConversations,
      avgMessagesPerConversation,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
