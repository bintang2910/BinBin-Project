/* ───────────────────────────────────────────────
   In-App Live Group Chat via Socket.io (v3)
   ─────────────────────────────────────────────── */

let socket = null;
let chatUserId = null;
let chatLobbyId = null;

const CHAT_API = 'http://' + window.location.hostname + ':3001';

async function initChat(lobbyId) {
    chatLobbyId = lobbyId;
    const chatSection = document.getElementById('chat-section');
    if (!chatSection) return;

    try {
        const res = await fetch(`${CHAT_API}/api/lobbies/${lobbyId}/chat`, {
            credentials: 'include'
        });
        const json = await res.json();

        if (!res.ok) {
            console.log("Chat locked: ", json.error);
            return; // Not paid/joined, so leave it hidden
        }

        // We passed authentication! Show chat.
        chatSection.style.display = 'block';
        
        // Import socket.io client dynamically
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = "https://cdn.socket.io/4.7.4/socket.io.min.js";
            script.onload = () => setupSocketBinding(json.data);
            document.head.appendChild(script);
        } else {
            setupSocketBinding(json.data);
        }

    } catch(e) {
        console.error("Chat init error", e);
    }
}

function setupSocketBinding(previousMessages) {
    fetch(`${CHAT_API}/api/auth/get-session`, { credentials: 'include' })
      .then(r => r.json())
      .then(sessionData => {
         chatUserId = sessionData?.user?.id;
         renderMessages(previousMessages);
         connectSocket();
      });
}

function connectSocket() {
    socket = io(CHAT_API, {
        withCredentials: true
    });

    socket.on("connect", () => {
        console.log("Connected to Live Chat!");
        socket.emit("join_room", chatLobbyId);
    });

    socket.on("new_message", (msg) => {
        appendMessage(msg);
        scrollToBottom();
    });

    // Bind UI
    const sendBtn = document.getElementById('chat-send');
    const input = document.getElementById('chat-input');
    
    if (!sendBtn || !input) return;

    const sendMsg = () => {
        const text = input.value.trim();
        if(!text) return;
        socket.emit("send_message", {
            lobbyId: chatLobbyId,
            userId: chatUserId,
            content: text
        });
        input.value = '';
    };

    sendBtn.addEventListener('click', sendMsg);
    input.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') sendMsg();
    });
}

function renderMessages(messages) {
    const list = document.getElementById('chat-messages');
    if (!list) return;
    list.innerHTML = '';
    messages.forEach(msg => {
        appendMessage(msg);
    });
    scrollToBottom();
}

function appendMessage(msg) {
    const list = document.getElementById('chat-messages');
    if (!list) return;
    const isMe = msg.userId === chatUserId;
    
    const div = document.createElement('div');
    div.className = `chat-bubble ${isMe ? 'me' : 'other'}`;
    
    div.innerHTML = `
      <div class="chat-bubble-name">${msg.user?.name || 'Unknown'}</div>
      ${msg.content}
    `;
    list.appendChild(div);
}

function scrollToBottom() {
    const list = document.getElementById('chat-messages');
    if (list) list.scrollTop = list.scrollHeight;
}
