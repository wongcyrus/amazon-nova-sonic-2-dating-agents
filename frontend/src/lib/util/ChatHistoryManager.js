export class ChatHistoryManager {
    static instance = null;

    constructor(chatRef, setChat) {
        if (ChatHistoryManager.instance) {
            return ChatHistoryManager.instance;
        }

        this.chatRef = chatRef;
        this.setChat = setChat;
        ChatHistoryManager.instance = this;
    }

    static getInstance(chatRef, setChat) {
        if (!ChatHistoryManager.instance) {
            ChatHistoryManager.instance = new ChatHistoryManager(chatRef, setChat);
        } else if (chatRef && setChat) {
            // Update references if they're provided
            ChatHistoryManager.instance.chatRef = chatRef;
            ChatHistoryManager.instance.setChat = setChat;
        }
        return ChatHistoryManager.instance;
    }

    addTextMessage(content) {
        if (!this.chatRef || !this.setChat) {
            console.error("ChatHistoryManager: chatRef or setChat is not initialized");
            return;
        }

        let history = this.chatRef.current?.history || [];
        let updatedChatHistory = [...history];

        // Direct typewriter placeholder support
        if (content.isTypewriterActive) {
            updatedChatHistory.push({
                role: content.role,
                message: content.message,
                isTypewriterActive: true
            });
            this.setChat({
                history: updatedChatHistory
            });
            return;
        }

        let lastTurn = updatedChatHistory[updatedChatHistory.length - 1];

        if (lastTurn !== undefined && lastTurn.role === content.role && !lastTurn.endOfResponse) {
            const lastMsg = (lastTurn.message || "").trim();
            const newMsg = (content.message || "").trim();

            // Detect if the new message is cumulative (contains or extends the last message) 
            // or if it's a duplicate. If so, overwrite with the latest value to prevent echo repeating.
            if (newMsg.startsWith(lastMsg) || lastMsg.startsWith(newMsg) || newMsg === lastMsg) {
                updatedChatHistory[updatedChatHistory.length - 1] = {
                    ...content,
                    message: content.message
                };
            } else {
                // Otherwise, append with a space separation
                updatedChatHistory[updatedChatHistory.length - 1] = {
                    ...content,
                    message: lastTurn.message + " " + content.message
                };
            }
        }
        else {
            // Different role, add a new turn
            updatedChatHistory.push({
                role: content.role,
                message: content.message
            });
        }

        this.setChat({
            history: updatedChatHistory
        });
    }

    updateTypewriterMessage(text) {
        if (!this.chatRef || !this.setChat) {
            return;
        }

        let history = this.chatRef.current?.history || [];
        let updatedChatHistory = [...history];
        let typewriterMsgIndex = updatedChatHistory.findIndex(item => item.isTypewriterActive);

        if (typewriterMsgIndex !== -1) {
            updatedChatHistory[typewriterMsgIndex] = {
                ...updatedChatHistory[typewriterMsgIndex],
                message: text
            };
            this.setChat({
                history: updatedChatHistory
            });
        }
    }

    finalizeTypewriterMessage() {
        if (!this.chatRef || !this.setChat) {
            return;
        }

        let history = this.chatRef.current?.history || [];
        let changed = false;
        let updatedChatHistory = history.map(item => {
            if (item.isTypewriterActive) {
                changed = true;
                return {
                    ...item,
                    isTypewriterActive: false,
                    endOfResponse: true
                };
            }
            return item;
        });

        if (changed) {
            this.setChat({
                history: updatedChatHistory
            });
        }
    }

    endTurn() {
        if (!this.chatRef || !this.setChat) {
            console.error("ChatHistoryManager: chatRef or setChat is not initialized");
            return;
        }

        let history = this.chatRef.current?.history || [];
        let updatedChatHistory = history.map(item => {
            return {
                ...item,
                endOfResponse: true
            };
        });

        this.setChat({
            history: updatedChatHistory
        });
    }

    endConversation() {
        if (!this.chatRef || !this.setChat) {
            console.error("ChatHistoryManager: chatRef or setChat is not initialized");
            return;
        }

        let history = this.chatRef.current?.history || [];
        let updatedChatHistory = history.map(item => {
            return {
                ...item,
                endOfResponse: true
            };
        });

        updatedChatHistory.push({
            endOfConversation: true
        });

        this.setChat({
            history: updatedChatHistory
        });
    }
}

export default ChatHistoryManager;