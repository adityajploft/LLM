import Message from '../models/Message.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { HfInference } from '@huggingface/inference';

export const handleChat = async (req, res) => {
  const { message, history = [], model, apiKey } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let reply = '';
  try {
    const selectedModel = model || 'groq';
    let key = apiKey ? apiKey.trim() : '';
    
    if (!key) {
      if (selectedModel === 'gemini' && process.env.GEMINI_API_KEY) key = process.env.GEMINI_API_KEY.trim();
      if (selectedModel === 'openai' && process.env.OPENAI_API_KEY) key = process.env.OPENAI_API_KEY.trim();
      if (selectedModel === 'groq' && process.env.GROQ_API_KEY) key = process.env.GROQ_API_KEY.trim();
      if (selectedModel === 'huggingface' && process.env.HUGGINGFACE_API_KEY) key = process.env.HUGGINGFACE_API_KEY.trim();
    }

    if (!key) {
      return res.status(400).json({ error: `API Key for ${selectedModel} is missing. Please provide it in the settings.` });
    }

    if (selectedModel === 'gemini') {
      console.log("Selected model:", selectedModel);
      console.log("Using Gemini model:", "gemini-3.6-flash");
      const genAI = new GoogleGenerativeAI(key);
      const geminiModel = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
      
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
      
      const chat = geminiModel.startChat({ history: formattedHistory });
      const result = await chat.sendMessage(message);
      const response = await result.response;
      reply = response.text();
    } else if (selectedModel === 'openai') {
      const openai = new OpenAI({ apiKey: key });
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      const chatCompletion = await openai.chat.completions.create({
        messages: [...formattedHistory, { role: 'user', content: message }],
        model: 'gpt-3.5-turbo',
      });
      reply = chatCompletion.choices[0].message.content;
    } else if (selectedModel === 'groq') {
      const groq = new Groq({ apiKey: key });
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
      const chatCompletion = await groq.chat.completions.create({
        messages: [...formattedHistory, { role: 'user', content: message }],
        model: groqModel,
      });
      reply = chatCompletion.choices[0].message.content;
    } else if (selectedModel === 'huggingface') {
      const hf = new HfInference(key);
      const hfModel = process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
      
      // Formatting for Hugging Face chat completion
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      const chatCompletion = await hf.chatCompletion({
        model: hfModel,
        messages: [...formattedHistory, { role: 'user', content: message }],
        max_tokens: 1024
      });
      reply = chatCompletion.choices[0].message.content;
    } else {
      reply = `Unsupported model: ${selectedModel}`;
    }

  } catch (error) {
    console.error("AI Service Error:", error);
    return res.status(500).json({ error: `AI Service Error: ${error.message}` });
  }

  try {
    if (req.user) {
      await Message.create({
        user: req.user._id,
        userMessage: message,
        aiResponse: reply
      });
    }
  } catch (err) {
    console.error("Error saving message:", err);
  }

  res.json({ reply });
};
