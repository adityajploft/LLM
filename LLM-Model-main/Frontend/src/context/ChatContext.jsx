import React, { createContext, useState, useEffect } from 'react';
import { sendMessage } from '../services/api';

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem('ai_chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeChatId, setActiveChatId] = useState(() => {
    const savedId = localStorage.getItem('ai_active_chat_id');
    return savedId || null;
  });
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('ai_selected_model') || 'groq';
  });

  const [apiKeys, setApiKeys] = useState(() => {
    const saved = localStorage.getItem('ai_api_keys');
    return saved ? JSON.parse(saved) : { gemini: '', openai: '', groq: '', huggingface: '' };
  });

  // Save to local storage whenever chats change
  useEffect(() => {
    localStorage.setItem('ai_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('ai_selected_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('ai_api_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('ai_active_chat_id', activeChatId);
    } else {
      localStorage.removeItem('ai_active_chat_id');
    }
  }, [activeChatId]);

  useEffect(() => {
    const handleRestore = () => {
      const savedBackup = localStorage.getItem('ai_chats_backup');
      const savedActiveId = localStorage.getItem('ai_active_chat_id_backup');
      if (savedBackup) {
        setChats(JSON.parse(savedBackup));
        if (savedActiveId && savedActiveId !== 'null') {
          setActiveChatId(savedActiveId);
        }
      }
    };
    window.addEventListener('restore-chat-backup', handleRestore);
    return () => window.removeEventListener('restore-chat-backup', handleRestore);
  }, []);

  const createNewChat = () => {
    const newChat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: []
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  const deleteChat = (id) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
    }
  };

  const renameChat = (id, newTitle) => {
    setChats(prev => prev.map(c => 
      c.id === id ? { ...c, title: newTitle } : c
    ));
  };

  const generateTitle = (firstMessage) => {
    return firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
  };

  const handleSendMessage = async (content, base64Image = null) => {
    let currentChatId = activeChatId;

    if (!currentChatId) {
      const newChat = {
        id: Date.now().toString(),
        title: generateTitle(content),
        messages: []
      };
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      currentChatId = newChat.id;
    }

    // Add user message (now including image if present)
    const userMessage = { role: 'user', content, image: base64Image };
    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        const title = chat.messages.length === 0 ? generateTitle(content) : chat.title;
        return { ...chat, title, messages: [...chat.messages, userMessage] };
      }
      return chat;
    }));

    setIsLoading(true);
    setError(null);

    try {
      const currentApiKey = apiKeys[selectedModel];
      
      const currentChat = chats.find(c => c.id === currentChatId);
      const history = currentChat ? currentChat.messages : [];
      const cleanHistory = history.filter(msg => msg.role !== 'error');

      const response = await sendMessage(content, cleanHistory, selectedModel, currentApiKey, base64Image);
      const aiMessage = { role: 'ai', content: response.reply || "No response received" };
      
      setChats(prev => prev.map(chat => 
        chat.id === currentChatId ? { ...chat, messages: [...chat.messages, aiMessage] } : chat
      ));
    } catch (err) {
      setError(err.message);
      
      const errMsg = err.message.toLowerCase();
      if (errMsg.includes('not authorized') || errMsg.includes('token') || errMsg.includes('401')) {
        const currentChats = localStorage.getItem('ai_chats');
        const currentId = localStorage.getItem('ai_active_chat_id');
        if (currentChats) localStorage.setItem('ai_chats_backup', currentChats);
        if (currentId) localStorage.setItem('ai_active_chat_id_backup', currentId);
      }

      const errorMessage = { role: 'error', content: err.message };
      setChats(prev => prev.map(chat => 
        chat.id === currentChatId ? { ...chat, messages: [...chat.messages, errorMessage] } : chat
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const backupChatHistory = () => {
    const currentChats = localStorage.getItem('ai_chats');
    const currentId = localStorage.getItem('ai_active_chat_id');
    if (currentChats) {
      localStorage.setItem('ai_chats_backup', currentChats);
    }
    if (currentId) {
      localStorage.setItem('ai_active_chat_id_backup', currentId);
    }
  };

  const restoreChatHistory = () => {
    const savedBackup = localStorage.getItem('ai_chats_backup');
    const savedActiveId = localStorage.getItem('ai_active_chat_id_backup');
    if (savedBackup) {
      setChats(JSON.parse(savedBackup));
      if (savedActiveId && savedActiveId !== 'null') {
        setActiveChatId(savedActiveId);
      }
    }
  };

  const handleRegenerate = async () => {
    if (!activeChatId) return;

    const currentChat = chats.find(c => c.id === activeChatId);
    if (!currentChat || currentChat.messages.length === 0) return;

    let filteredMessages = [...currentChat.messages];
    while (filteredMessages.length > 0 && filteredMessages[filteredMessages.length - 1].role === 'error') {
      filteredMessages.pop();
    }

    if (filteredMessages.length === 0) return;
    
    let lastUserMessage = "";
    let lastUserImage = null;
    if (filteredMessages[filteredMessages.length - 1].role === 'ai') {
        for (let i = filteredMessages.length - 1; i >= 0; i--) {
            if (filteredMessages[i].role === 'user') {
                lastUserMessage = filteredMessages[i].content;
                lastUserImage = filteredMessages[i].image || null;
                filteredMessages = filteredMessages.slice(0, i);
                break;
            }
        }
    } else if (filteredMessages[filteredMessages.length - 1].role === 'user') {
        lastUserMessage = filteredMessages[filteredMessages.length - 1].content;
        lastUserImage = filteredMessages[filteredMessages.length - 1].image || null;
        filteredMessages.pop(); 
    }
    
    if (!lastUserMessage && !lastUserImage) return;

    setChats(prev => prev.map(chat => 
      chat.id === activeChatId ? { ...chat, messages: [...filteredMessages, { role: 'user', content: lastUserMessage, image: lastUserImage }] } : chat
    ));

    setIsLoading(true);
    setError(null);

    try {
      const currentApiKey = apiKeys[selectedModel];
      const cleanHistory = filteredMessages.filter(msg => msg.role !== 'error');

      const response = await sendMessage(lastUserMessage, cleanHistory, selectedModel, currentApiKey, lastUserImage);
      const aiMessage = { role: 'ai', content: response.reply || "No response received" };
      
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId ? { ...chat, messages: [...chat.messages, aiMessage] } : chat
      ));
    } catch (err) {
      setError(err.message);
      
      const errorMessage = { role: 'error', content: err.message };
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId ? { ...chat, messages: [...chat.messages, errorMessage] } : chat
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  return (
    <ChatContext.Provider value={{
      chats,
      activeChat,
      activeChatId,
      setActiveChatId,
      createNewChat,
      deleteChat,
      renameChat,
      handleSendMessage,
      handleRegenerate,
      isSidebarOpen,
      setSidebarOpen,
      isSettingsOpen,
      setSettingsOpen,
      selectedModel,
      setSelectedModel,
      apiKeys,
      setApiKeys,
      isLoading,
      error,
      backupChatHistory,
      restoreChatHistory,
    }}>
      {children}
    </ChatContext.Provider>
  );
};
