const express = require('express');
const router = express.Router();
const https = require('https');
const Chat = require('../models/Chat');
const auth = require('../middleware/auth');

// GET all chats
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id })
      .select('-messages')
      .sort({ updatedAt: -1 });

    res.json(chats);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// GET single chat
router.get('/:id', auth, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!chat) return res.status(404).json({ msg: 'Chat not found' });

    res.json(chat);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// CREATE new chat
router.post('/', auth, async (req, res) => {
  try {
    const newChat = new Chat({
      userId: req.user.id,
      title: 'New Conversation',
      messages: []
    });

    const chat = await newChat.save();
    res.json(chat);

  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// DELETE chat
router.delete('/:id', auth, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!chat) return res.status(404).json({ msg: 'Chat not found' });

    await chat.deleteOne();

    res.json({ msg: 'Chat removed' });

  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// RENAME chat
router.put('/:id', auth, async (req, res) => {
  try {
    const { title } = req.body;
    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!chat) return res.status(404).json({ msg: 'Chat not found' });

    chat.title = title;
    await chat.save();

    res.json(chat);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Helper: make HTTPS request with native Node.js (avoids node-fetch ESM issue)
function openRouterRequest(apiKey, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'HTTP-Referer': 'https://github.com/Sachindhankhar2003/HP', // OpenRouter request header
        'X-Title': 'Advanced AI Chatbot',
        'User-Agent': 'NodeJS/ChatbotApp'
      }
    };

    const req = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => { data += chunk; });
      apiRes.on('end', () => {
        if (apiRes.statusCode >= 500) {
          return reject(new Error(`OpenRouter Server Error (${apiRes.statusCode}): ${data.substring(0, 100)}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse API response (Status ${apiRes.statusCode}): ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Network Error: ${err.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('API request timed out (30s)'));
    });

    req.write(postData);
    req.end();
  });
}

// SEND MESSAGE
router.post('/:id/message', auth, async (req, res) => {
  try {
    const { content } = req.body;

    let chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!chat) return res.status(404).json({ msg: 'Chat not found' });

    // first message title
    if (chat.messages.length === 0) {
      chat.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    // save user message
    chat.messages.push({
      role: 'user',
      content
    });

    chat.updatedAt = Date.now();
    await chat.save();

    // last 10 messages
    const recentMessages = chat.messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }));

    const systemMessages = [
      {
        role: 'system',
        content: `You are PocketGPT, a professional and highly intelligent AI assistant. 
        Your goal is to provide precise, structured, and helpful responses.
        
        Rules for Behavior:
        - Provide clear, concise explanations using professional language.
        - Use bullet points, bold text, and markdown headers to organize information.
        - Give concrete examples when explaining abstract concepts.
        - If a user provides a document, prioritize the information in that document above all else.
        - If the user asks about something NOT in the provided document, state clearly: "I couldn't find specific information about this in the uploaded document, but based on my general knowledge..."
        - Maintain a professional yet helpful tone.`
      }
    ];

    if (chat.systemContext) {
      systemMessages.push({
        role: 'system',
        content: `PRIORITY DOCUMENT CONTEXT:\n${chat.systemContext}\n\nStrictly prioritize the information above for any questions related to the document.`
      });
    }

    const apiMessages = [...systemMessages, ...recentMessages];

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ msg: 'API key not configured' });
    }

    // AI CALL - try multiple models as fallback
    const modelsToTry = [
      'openrouter/free', // Meta-router that automatically selects a working free model
      'google/gemma-4-31b-it:free',
      'google/gemma-3-27b:free',
      'qwen/qwen-3-72b-instruct:free',
      'mistralai/mistral-small-instruct:free',
      'google/gemma-2-9b-it:free',
    ];

    let data = null;
    let lastError = 'No models responded successfully';

    for (const model of modelsToTry) {
      try {
        console.log(`Attempting model: ${model}`);
        data = await openRouterRequest(apiKey, {
          model,
          messages: apiMessages
        });

        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          console.log(`Success with model: ${model}`);
          break; // Success!
        }
        
        lastError = data?.error?.message || 'Empty or invalid response';
        console.log(`Model ${model} failed: ${lastError}`);
        data = null;
      } catch (err) {
        lastError = err.message;
        console.log(`Model ${model} threw error: ${lastError}`);
        data = null;
      }
    }

    if (!data) {
      // Remove trailing dot if present in lastError to avoid double dots
      const cleanError = lastError.endsWith('.') ? lastError.slice(0, -1) : lastError;
      console.error('All models failed. Last error:', cleanError);
      
      // Fallback response for local verification/offline mode
      const lowerContent = content.toLowerCase();
      let mockReply = '';
      if (lowerContent.includes('hello') || lowerContent.includes('hi')) {
        mockReply = "Hello! I am PocketGPT (currently running in offline fallback mode because the OpenRouter API key is invalid or not configured). How can I help you today?";
      } else if (chat.systemContext) {
        mockReply = `I am running in offline fallback mode. I see you uploaded a document context, but I can't process it using the AI models right now because the API key is not working. 

To enable full AI capabilities, please check the \`OPENROUTER_API_KEY\` variable in the \`backend/.env\` file.`;
      } else {
        mockReply = `This is a simulated response from PocketGPT (running in offline fallback mode).

Your message was: "${content}"

To get real AI-generated responses, please configure a valid \`OPENROUTER_API_KEY\` in your \`backend/.env\` file.`;
      }

      chat.messages.push({
        role: 'assistant',
        content: mockReply
      });
      await chat.save();
      return res.json({ reply: mockReply });
    }

    const aiReply = data.choices[0].message.content;

    // save AI reply
    chat.messages.push({
      role: 'assistant',
      content: aiReply
    });

    await chat.save();

    // send response as JSON
    res.json({ reply: aiReply });

  } catch (err) {
    console.error('Chat message error:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;