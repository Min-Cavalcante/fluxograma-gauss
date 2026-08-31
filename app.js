// ============================================================
// Gauss Energia - Collaborative Flowchart App
// With Pinning, Attachments, and Comments
// ============================================================

class FlowchartApp {
  constructor() {
    // State
    this.nodes = [];
    this.connections = [];
    this.users = new Map();
    this.currentUser = null;
    this.selectedNode = null;
    this.selectedConnection = null;
    this.mode = 'select';
    this.connectingFrom = null;
    this.isDragging = false;
    this.isPanning = false;
    this.dragOffset = { x: 0, y: 0 };
    this.panStart = { x: 0, y: 0 };
    this.transform = { x: 0, y: 0, scale: 1 };
    this.history = [];
    this.historyIndex = -1;
    this.version = 3; // Schema version (increased for new features)
    
    // DOM elements
    this.svg = document.getElementById('mainCanvas');
    this.nodesLayer = document.getElementById('nodesLayer');
    this.connectionsLayer = document.getElementById('connectionsLayer');
    this.cursorsLayer = document.getElementById('cursorsLayer');
    this.canvasContainer = document.getElementById('canvasContainer');
    this.actionsPanel = document.getElementById('actionsPanel');
    this.commentTooltip = document.getElementById('commentTooltip');
    
    // Color palette for users
    this.userColors = [
      '#39B54A', '#2B6CFF', '#F2B441', '#D9534F', 
      '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'
    ];
    
    this.init();
  }
  
  init() {
    this.setupLogin();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupCollaboration();
    this.loadFromStorage();
    this.render();
    this.startAutoSave();
  }
  
  // ============================================================
  // LOGIN & USER MANAGEMENT
  // ============================================================
  setupLogin() {
    const loginModal = document.getElementById('loginModal');
    const loginBtn = document.getElementById('loginBtn');
    const userNameInput = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
      loginModal.style.display = 'none';
      this.updateUserUI();
      this.announcePresence();
    }
    
    loginBtn.addEventListener('click', () => this.handleLogin());
    userNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    
    logoutBtn.addEventListener('click', () => this.handleLogout());
  }
  
  handleLogin() {
    const userName = document.getElementById('userName').value.trim();
    if (!userName) {
      alert('Por favor, digite seu nome');
      return;
    }
    
    this.currentUser = {
      id: this.generateId(),
      name: userName,
      color: this.userColors[Math.floor(Math.random() * this.userColors.length)],
      timestamp: Date.now()
    };
    
    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
    document.getElementById('loginModal').style.display = 'none';
    this.updateUserUI();
    this.announcePresence();
  }
  
  handleLogout() {
    localStorage.removeItem('currentUser');
    this.removePresence();
    location.reload();
  }
  
  updateUserUI() {
    document.getElementById('currentUserName').textContent = this.currentUser.name;
    this.updateUserAvatars();
  }
  
  updateUserAvatars() {
    const container = document.getElementById('userAvatars');
    container.innerHTML = '';
    
    this.users.forEach(user => {
      if (user.id === this.currentUser.id) return;
      
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar';
      avatar.style.background = user.color;
      avatar.textContent = user.name.substring(0, 2).toUpperCase();
      avatar.title = user.name;
      container.appendChild(avatar);
    });
  }
  
  // ============================================================
  // COLLABORATION
  // ============================================================
  setupCollaboration() {
    this.channel = new BroadcastChannel('gauss_flowchart');
    
    this.channel.onmessage = (event) => {
      const { type, data } = event.data;
      
      switch(type) {
        case 'presence':
          this.users.set(data.id, data);
          this.updateUserAvatars();
          break;
        case 'cursor':
          this.updateRemoteCursor(data);
          break;
        case 'change':
          this.handleRemoteChange(data);
          break;
        case 'leave':
          this.users.delete(data.id);
          this.removeRemoteCursor(data.id);
          this.updateUserAvatars();
          break;
      }
    };
    
    this.canvasContainer.addEventListener('mousemove', (e) => {
      if (!this.currentUser) return;
      
      this.channel.postMessage({
        type: 'cursor',
        data: {
          userId: this.currentUser.id,
          userName: this.currentUser.name,
          color: this.currentUser.color,
          x: e.clientX,
          y: e.clientY
        }
      });
    });
    
    window.addEventListener('beforeunload', () => {
      this.removePresence();
    });
  }
  
  announcePresence() {
    this.channel.postMessage({
      type: 'presence',
      data: this.currentUser
    });
    
    this.presenceInterval = setInterval(() => {
      this.channel.postMessage({
        type: 'presence',
        data: this.currentUser
      });
    }, 30000);
  }
  
  removePresence() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
    }
    this.channel.postMessage({
      type: 'leave',
      data: { id: this.currentUser.id }
    });
  }
  
  updateRemoteCursor(data) {
    let cursor = document.getElementById(`cursor-${data.userId}`);
    
    if (!cursor) {
      cursor = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      cursor.id = `cursor-${data.userId}`;
      cursor.innerHTML = `
        <path d="M 0 0 L 0 16 L 4 12 L 7 18 L 9 17 L 6 11 L 11 11 Z" 
              fill="${data.color}" stroke="white" stroke-width="1"/>
        <text x="14" y="20" font-family="var(--font-mono)" font-size="11" 
              fill="${data.color}" stroke="white" stroke-width="2" paint-order="stroke">
          ${data.userName}
        </text>
        <text x="14" y="20" font-family="var(--font-mono)" font-size="11" 
              fill="white">
          ${data.userName}
        </text>
      `;
      this.cursorsLayer.appendChild(cursor);
    }
    
    const rect = this.canvasContainer.getBoundingClientRect();
    const x = (data.x - rect.left - this.transform.x) / this.transform.scale;
    const y = (data.y - rect.top - this.transform.y) / this.transform.scale;
    
    cursor.setAttribute('transform', `translate(${x}, ${y})`);
  }
  
  removeRemoteCursor(userId) {
    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) cursor.remove();
  }
  
  broadcastChange() {
    this.channel.postMessage({
      type: 'change',
      data: {
        nodes: this.nodes,
        connections: this.connections,
        userId: this.currentUser.id
      }
    });
  }
  
  handleRemoteChange(data) {
    if (data.userId === this.currentUser.id) return;
    
    this.nodes = data.nodes;
    this.connections = data.connections;
    this.render();
  }
  
  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  setupEventListeners() {
    // Toolbar
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.tool;
        this.updateToolbar();
      });
    });
    
    document.querySelectorAll('.tool-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.handleAction(btn.dataset.action);
      });
    });
    
    // Canvas interactions
    this.svg.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.svg.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.svg.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.svg.addEventListener('click', (e) => this.handleClick(e));
    this.svg.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    
    // Actions panel
    document.getElementById('closePanelBtn').addEventListener('click', () => {
      this.hideActionsPanel();
    });
    
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.handlePanelAction(btn.dataset.action);
      });
    });
    
    // File upload
    document.getElementById('fileInput').addEventListener('change', (e) => {
      this.handleFileUpload(e.target.files);
    });
    
    // Comments
    document.getElementById('addCommentBtn').addEventListener('click', () => {
      this.addComment();
    });
    
    document.getElementById('commentInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.addComment();
      }
    });
    
    document.getElementById('closeComments').addEventListener('click', () => {
      document.getElementById('commentsSection').style.display = 'none';
    });
    
    // Help
    document.getElementById('helpBtn').addEventListener('click', () => {
      document.getElementById('helpModal').style.display = 'flex';
    });
    
    document.getElementById('closeHelp').addEventListener('click', () => {
      document.getElementById('helpModal').style.display = 'none';
    });
    
    // Zoom with wheel
    this.canvasContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom(delta, e.clientX, e.clientY);
    });
    
    // Comment tooltip on hover
    this.svg.addEventListener('mouseover', (e) => {
      const nodeEl = e.target.closest('.flowchart-node');
      if (nodeEl) {
        const nodeId = nodeEl.dataset.nodeId;
        const node = this.nodes.find(n => n.id === nodeId);
        if (node && node.comments && node.comments.length > 0) {
          this.showCommentTooltip(node, e);
        }
      }
    });
    
    this.svg.addEventListener('mouseout', (e) => {
      const nodeEl = e.target.closest('.flowchart-node');
      if (nodeEl) {
        this.hideCommentTooltip();
      }
    });
  }
  
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const isMod = e.ctrlKey || e.metaKey;
      
      switch(e.key.toLowerCase()) {
        case 'v':
          this.mode = 'select';
          this.updateToolbar();
          break;
        case 'c':
          this.mode = 'connect';
          this.updateToolbar();
          break;
        case 'delete':
        case 'backspace':
          this.deleteSelected();
          break;
        case 'enter':
          if (this.selectedNode) this.editNodeText(this.selectedNode);
          break;
        case '=':
        case '+':
          this.zoom(1.1);
          break;
        case '-':
        case '_':
          this.zoom(0.9);
          break;
        case '0':
          this.fitToView();
          break;
        case ' ':
          this.isPanning = true;
          this.canvasContainer.classList.add('panning');
          e.preventDefault();
          break;
        case 's':
          if (isMod) {
            e.preventDefault();
            this.saveToStorage();
            this.showNotification('Salvo!');
          }
          break;
        case 'z':
          if (isMod) {
            e.preventDefault();
            this.undo();
          }
          break;
        case 'escape':
          this.hideActionsPanel();
          this.selectedNode = null;
          this.selectedConnection = null;
          this.render();
          break;
      }
    });
    
    document.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        this.isPanning = false;
        this.canvasContainer.classList.remove('panning');
      }
    });
  }
  
  // ============================================================
  // MOUSE INTERACTIONS
  // ============================================================
  handleMouseDown(e) {
    if (e.button !== 0) return;
    
    const point = this.getMousePosition(e);
    const clickedNode = this.getNodeAtPoint(point);
    
    if (this.isPanning || e.spaceKey) {
      this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
      return;
    }
    
    if (this.mode === 'select' && clickedNode) {
      this.selectedNode = clickedNode;
      this.isDragging = true;
      this.dragOffset = {
        x: point.x - clickedNode.x,
        y: point.y - clickedNode.y
      };
      this.showActionsPanel();
      this.render();
    } else if (this.mode === 'connect' && clickedNode) {
      if (!this.connectingFrom) {
        this.connectingFrom = clickedNode;
      } else {
        this.createConnection(this.connectingFrom, clickedNode);
        this.connectingFrom = null;
      }
    }
  }
  
  handleMouseMove(e) {
    const point = this.getMousePosition(e);
    
    if (this.isPanning && e.buttons === 1) {
      this.transform.x = e.clientX - this.panStart.x;
      this.transform.y = e.clientY - this.panStart.y;
      this.applyTransform();
      return;
    }
    
    if (this.isDragging && this.selectedNode) {
      this.selectedNode.x = point.x - this.dragOffset.x;
      this.selectedNode.y = point.y - this.dragOffset.y;
      this.render();
    }
  }
  
  handleMouseUp(e) {
    if (this.isDragging) {
      this.addToHistory();
      this.broadcastChange();
    }
    
    this.isDragging = false;
  }
  
  handleClick(e) {
    const point = this.getMousePosition(e);
    const clickedNode = this.getNodeAtPoint(point);
    
    if (['process', 'decision', 'start'].includes(this.mode)) {
      this.createNode(this.mode, point);
    } else if (this.mode === 'select') {
      if (!clickedNode) {
        this.selectedNode = null;
        this.selectedConnection = null;
        this.hideActionsPanel();
        this.render();
      }
    }
  }
  
  handleDoubleClick(e) {
    const point = this.getMousePosition(e);
    const clickedNode = this.getNodeAtPoint(point);
    
    if (clickedNode) {
      this.editNodeText(clickedNode);
    }
  }
  
  // ============================================================
  // ACTIONS PANEL
  // ============================================================
  showActionsPanel() {
    if (!this.selectedNode) return;
    
    this.actionsPanel.style.display = 'block';
    
    // Update collapse button
    const collapseText = document.getElementById('collapseText');
    const descendants = this.getAllDescendants(this.selectedNode);
    
    if (descendants.length > 0) {
      const isCollapsed = this.selectedNode.collapsed;
      collapseText.textContent = isCollapsed 
        ? `Expandir (${descendants.length} itens)` 
        : `Colapsar (${descendants.length} itens)`;
      document.getElementById('collapseBtn').style.display = 'flex';
    } else {
      document.getElementById('collapseBtn').style.display = 'none';
    }
    
    // Update pin button
    const pinText = document.getElementById('pinText');
    pinText.textContent = this.selectedNode.pinned ? 'Desafixar cartão' : 'Fixar cartão';
    
    // Update attachments section
    this.updateAttachmentsUI();
    
    // Update comments
    this.updateCommentsCount();
  }
  
  hideActionsPanel() {
    this.actionsPanel.style.display = 'none';
    document.getElementById('commentsSection').style.display = 'none';
    document.getElementById('attachmentsSection').style.display = 'none';
  }
  
  handlePanelAction(action) {
    if (!this.selectedNode) return;
    
    switch(action) {
      case 'edit':
        this.editNodeText(this.selectedNode);
        break;
      case 'add-after':
        this.addNodeAfter(this.selectedNode);
        break;
      case 'add-before':
        this.addNodeBefore(this.selectedNode);
        break;
      case 'pin':
        this.toggleNodePin(this.selectedNode);
        break;
      case 'collapse':
        this.toggleNodeCollapse(this.selectedNode);
        break;
      case 'change-color':
        this.changeNodeColor(this.selectedNode);
        break;
      case 'attach':
        document.getElementById('fileInput').click();
        break;
      case 'comment':
        this.openCommentsSection();
        break;
      case 'delete':
        this.deleteSelected();
        this.hideActionsPanel();
        break;
    }
  }
  
  // ============================================================
  // NODE MANAGEMENT
  // ============================================================
  createNode(type, point) {
    const node = {
      id: this.generateId(),
      type,
      x: point.x,
      y: point.y,
      width: type === 'decision' ? 120 : 160,
      height: type === 'start' ? 60 : 80,
      text: `Novo ${type === 'process' ? 'Processo' : type === 'decision' ? 'Decisão' : 'Início'}`,
      color: this.getNodeColor(type),
      collapsed: false,
      pinned: false,
      attachments: [],
      comments: []
    };
    
    this.nodes.push(node);
    this.selectedNode = node;
    this.addToHistory();
    this.render();
    this.broadcastChange();
    this.showActionsPanel();
    
    setTimeout(() => this.editNodeText(node), 100);
  }
  
  getNodeColor(type) {
    switch(type) {
      case 'process': return '#FFFFFF';
      case 'decision': return '#FFF9E6';
      case 'start': return '#E6F5EA';
      default: return '#FFFFFF';
    }
  }
  
  createConnection(from, to, label = '') {
    const exists = this.connections.find(c => 
      c.from === from.id && c.to === to.id
    );
    
    if (exists || from.id === to.id) return;
    
    this.connections.push({
      id: this.generateId(),
      from: from.id,
      to: to.id,
      label
    });
    
    this.addToHistory();
    this.render();
    this.broadcastChange();
  }
  
  deleteSelected() {
    if (this.selectedNode) {
      this.nodes = this.nodes.filter(n => n.id !== this.selectedNode.id);
      this.connections = this.connections.filter(c => 
        c.from !== this.selectedNode.id && c.to !== this.selectedNode.id
      );
      this.selectedNode = null;
      this.addToHistory();
      this.render();
      this.broadcastChange();
    } else if (this.selectedConnection) {
      this.connections = this.connections.filter(c => c.id !== this.selectedConnection.id);
      this.selectedConnection = null;
      this.addToHistory();
      this.render();
      this.broadcastChange();
    }
  }
  
  editNodeText(node) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.text;
    input.className = 'node-text-input';
    
    const rect = this.canvasContainer.getBoundingClientRect();
    input.style.left = `${rect.left + (node.x + this.transform.x) * this.transform.scale - node.width/2}px`;
    input.style.top = `${rect.top + (node.y + this.transform.y) * this.transform.scale - 20}px`;
    input.style.width = `${node.width}px`;
    
    document.body.appendChild(input);
    input.focus();
    input.select();
    
    const finish = () => {
      node.text = input.value || 'Sem título';
      input.remove();
      this.addToHistory();
      this.render();
      this.broadcastChange();
    };
    
    input.addEventListener('blur', finish);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') finish();
    });
  }
  
  // ============================================================
  // PIN FUNCTIONALITY
  // ============================================================
  toggleNodePin(node) {
    node.pinned = !node.pinned;
    this.showActionsPanel();
    this.render();
    this.broadcastChange();
    this.showNotification(node.pinned ? '📌 Cartão fixado' : 'Cartão desafixado');
  }
  
  // ============================================================
  // COLLAPSE/EXPAND WITH DESCENDANTS
  // ============================================================
  getAllDescendants(node) {
    const descendants = [];
    const visited = new Set();
    
    const traverse = (currentNode) => {
      const children = this.connections
        .filter(c => c.from === currentNode.id)
        .map(c => this.nodes.find(n => n.id === c.to))
        .filter(n => n && !visited.has(n.id));
      
      children.forEach(child => {
        visited.add(child.id);
        descendants.push(child);
        traverse(child);
      });
    };
    
    traverse(node);
    return descendants;
  }
  
  toggleNodeCollapse(node) {
    node.collapsed = !node.collapsed;
    this.showActionsPanel();
    this.render();
    this.broadcastChange();
  }
  
  isNodeVisible(node) {
    // Pinned nodes are always visible
    if (node.pinned) return true;
    
    // Check if any ancestor is collapsed
    const parents = this.connections
      .filter(c => c.to === node.id)
      .map(c => this.nodes.find(n => n.id === c.from))
      .filter(n => n);
    
    for (let parent of parents) {
      if (parent.collapsed) return false;
      if (!this.isNodeVisible(parent)) return false;
    }
    
    return true;
  }
  
  addNodeAfter(node) {
    const newNode = {
      id: this.generateId(),
      type: 'process',
      x: node.x + 200,
      y: node.y,
      width: 160,
      height: 80,
      text: 'Novo Processo',
      color: '#FFFFFF',
      collapsed: false,
      pinned: false,
      attachments: [],
      comments: []
    };
    
    this.nodes.push(newNode);
    this.createConnection(node, newNode);
    this.selectedNode = newNode;
    this.showActionsPanel();
    this.editNodeText(newNode);
  }
  
  addNodeBefore(node) {
    const newNode = {
      id: this.generateId(),
      type: 'process',
      x: node.x - 200,
      y: node.y,
      width: 160,
      height: 80,
      text: 'Novo Processo',
      color: '#FFFFFF',
      collapsed: false,
      pinned: false,
      attachments: [],
      comments: []
    };
    
    this.nodes.push(newNode);
    this.createConnection(newNode, node);
    this.selectedNode = newNode;
    this.showActionsPanel();
    this.editNodeText(newNode);
  }
  
  changeNodeColor(node) {
    const colors = ['#FFFFFF', '#E6F5EA', '#FFF9E6', '#FFE6E6', '#E6F0FF'];
    const currentIndex = colors.indexOf(node.color);
    node.color = colors[(currentIndex + 1) % colors.length];
    this.render();
    this.broadcastChange();
  }
  
  // ============================================================
  // FILE ATTACHMENTS
  // ============================================================
  handleFileUpload(files) {
    if (!this.selectedNode || !files.length) return;
    
    Array.from(files).forEach(file => {
      // In a real app, you'd upload to a server and get a URL
      // For now, we'll store file metadata and use FileReader for preview
      
      const attachment = {
        id: this.generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        uploadedBy: this.currentUser.name,
        uploadedAt: new Date().toISOString()
      };
      
      // Convert to base64 for storage (only for small files/images)
      if (file.type.startsWith('image/') && file.size < 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          attachment.dataUrl = e.target.result;
          this.selectedNode.attachments.push(attachment);
          this.updateAttachmentsUI();
          this.render();
          this.broadcastChange();
          this.showNotification(`📎 ${file.name} anexado`);
        };
        reader.readAsDataURL(file);
      } else {
        // For larger files, just store metadata
        attachment.dataUrl = null;
        this.selectedNode.attachments.push(attachment);
        this.updateAttachmentsUI();
        this.render();
        this.broadcastChange();
        this.showNotification(`📎 ${file.name} anexado`);
      }
    });
  }
  
  updateAttachmentsUI() {
    const section = document.getElementById('attachmentsSection');
    const list = document.getElementById('attachmentsList');
    
    if (!this.selectedNode || !this.selectedNode.attachments || this.selectedNode.attachments.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    list.innerHTML = '';
    
    this.selectedNode.attachments.forEach(attachment => {
      const item = document.createElement('div');
      item.className = 'attachment-item';
      
      const iconClass = this.getAttachmentIcon(attachment.type);
      
      item.innerHTML = `
        <div class="attachment-icon ${iconClass}">
          ${this.getAttachmentIconSVG(attachment.type)}
        </div>
        <div class="attachment-info">
          <div class="attachment-name">${attachment.name}</div>
          <div class="attachment-meta">${this.formatFileSize(attachment.size)} · ${attachment.uploadedBy}</div>
        </div>
        <div class="attachment-actions">
          ${attachment.dataUrl ? `
            <button class="attachment-action" onclick="window.open('${attachment.dataUrl}')" title="Abrir">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 3v6m0 0v6m0-6h6m-6 0H4"/>
              </svg>
            </button>
          ` : ''}
          <button class="attachment-action delete" data-attachment-id="${attachment.id}" title="Remover">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 6l8 8M14 6l-8 8"/>
            </svg>
          </button>
        </div>
      `;
      
      // Add delete listener
      item.querySelector('.delete').addEventListener('click', () => {
        this.deleteAttachment(attachment.id);
      });
      
      list.appendChild(item);
    });
  }
  
  deleteAttachment(attachmentId) {
    if (!this.selectedNode) return;
    
    this.selectedNode.attachments = this.selectedNode.attachments.filter(a => a.id !== attachmentId);
    this.updateAttachmentsUI();
    this.render();
    this.broadcastChange();
    this.showNotification('🗑️ Anexo removido');
  }
  
  getAttachmentIcon(type) {
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'pdf';
    return '';
  }
  
  getAttachmentIconSVG(type) {
    if (type.startsWith('image/')) {
      return '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h14a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1zm2 3v8l4-3 4 3V6H5z"/></svg>';
    }
    if (type === 'application/pdf') {
      return '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M4 2h8l4 4v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zm8 0v4h4"/></svg>';
    }
    return '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M4 2h8l4 4v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z"/></svg>';
  }
  
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  
  // ============================================================
  // COMMENTS
  // ============================================================
  openCommentsSection() {
    const section = document.getElementById('commentsSection');
    section.style.display = 'block';
    this.updateCommentsList();
    document.getElementById('commentInput').focus();
  }
  
  addComment() {
    if (!this.selectedNode) return;
    
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const comment = {
      id: this.generateId(),
      author: this.currentUser.name,
      authorColor: this.currentUser.color,
      text: text,
      timestamp: new Date().toISOString()
    };
    
    if (!this.selectedNode.comments) {
      this.selectedNode.comments = [];
    }
    
    this.selectedNode.comments.push(comment);
    input.value = '';
    
    this.updateCommentsList();
    this.updateCommentsCount();
    this.render();
    this.broadcastChange();
    this.showNotification('💬 Comentário adicionado');
  }
  
  updateCommentsList() {
    if (!this.selectedNode) return;
    
    const list = document.getElementById('commentsList');
    list.innerHTML = '';
    
    if (!this.selectedNode.comments || this.selectedNode.comments.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 6a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H8l-3 3v-3H5a2 2 0 01-2-2V6z"/>
          </svg>
          <div class="empty-state-text">Nenhum comentário ainda.<br>Seja o primeiro a comentar!</div>
        </div>
      `;
      return;
    }
    
    this.selectedNode.comments.forEach(comment => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      
      const date = new Date(comment.timestamp);
      const timeAgo = this.getTimeAgo(date);
      
      item.innerHTML = `
        <div class="comment-header">
          <div class="comment-author">
            <div class="comment-avatar" style="background: ${comment.authorColor}">
              ${comment.author.substring(0, 2).toUpperCase()}
            </div>
            <span class="comment-author-name">${comment.author}</span>
          </div>
          <span class="comment-date">${timeAgo}</span>
        </div>
        <div class="comment-body">${this.escapeHtml(comment.text)}</div>
        <div class="comment-actions">
          <button class="comment-action-btn delete" data-comment-id="${comment.id}">Deletar</button>
        </div>
      `;
      
      // Delete listener
      item.querySelector('.delete').addEventListener('click', () => {
        this.deleteComment(comment.id);
      });
      
      list.appendChild(item);
    });
  }
  
  deleteComment(commentId) {
    if (!this.selectedNode) return;
    
    this.selectedNode.comments = this.selectedNode.comments.filter(c => c.id !== commentId);
    this.updateCommentsList();
    this.updateCommentsCount();
    this.render();
    this.broadcastChange();
    this.showNotification('🗑️ Comentário removido');
  }
  
  updateCommentsCount() {
    const count = this.selectedNode?.comments?.length || 0;
    const badge = document.getElementById('commentCount');
    
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
  
  showCommentTooltip(node, event) {
    if (!node.comments || node.comments.length === 0) return;
    
    const tooltip = this.commentTooltip;
    const latestComment = node.comments[node.comments.length - 1];
    
    tooltip.innerHTML = `
      <div class="comment-tooltip-author">${latestComment.author}</div>
      <div class="comment-tooltip-body">${this.escapeHtml(latestComment.text)}</div>
    `;
    
    tooltip.style.display = 'block';
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY + 20}px`;
  }
  
  hideCommentTooltip() {
    this.commentTooltip.style.display = 'none';
  }
  
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'agora';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d atrás`;
    
    return date.toLocaleDateString('pt-BR');
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // ============================================================
  // RENDERING
  // ============================================================
  render() {
    this.renderConnections();
    this.renderNodes();
    this.updateMinimap();
  }
  
  renderNodes() {
    this.nodesLayer.innerHTML = '';
    
    this.nodes.forEach(node => {
      if (!this.isNodeVisible(node)) return;
      
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('flowchart-node');
      g.dataset.nodeId = node.id;
      if (node.collapsed) g.classList.add('collapsed');
      if (this.selectedNode?.id === node.id) g.classList.add('selected');
      
      g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
      
      // Shape
      let shape;
      if (node.type === 'decision') {
        shape = `<path class="node-shape" d="M 0,-${node.height/2} L ${node.width/2},0 L 0,${node.height/2} L -${node.width/2},0 Z" fill="${node.color}" />`;
      } else if (node.type === 'start') {
        shape = `<rect class="node-shape" x="${-node.width/2}" y="${-node.height/2}" width="${node.width}" height="${node.height}" rx="30" fill="${node.color}" />`;
      } else {
        shape = `<rect class="node-shape" x="${-node.width/2}" y="${-node.height/2}" width="${node.width}" height="${node.height}" rx="8" fill="${node.color}" />`;
      }
      
      g.innerHTML = shape;
      
      // Text
      const text = this.createWrappedText(node.text, node.width - 20);
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.classList.add('node-text');
      textEl.setAttribute('y', '0');
      textEl.innerHTML = text;
      g.appendChild(textEl);
      
      // Pin indicator
      if (node.pinned) {
        const pin = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        pin.innerHTML = `
          <path class="node-pin-indicator" 
                d="M ${-node.width/2 + 8} ${-node.height/2 + 6} l 2 -2 l 2 2 l 0 4 l 2 2 l 0 2 l -3 0 l 0 4 l -2 0 l 0 -4 l -3 0 l 0 -2 l 2 -2 Z"
                transform="scale(0.8)"/>
        `;
        g.appendChild(pin);
      }
      
      // Comment indicator (triangle top-right)
      if (node.comments && node.comments.length > 0) {
        const commentIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        commentIndicator.setAttribute('d', `M ${node.width/2 - 16} ${-node.height/2} L ${node.width/2} ${-node.height/2} L ${node.width/2} ${-node.height/2 + 16} Z`);
        commentIndicator.setAttribute('fill', '#D9534F');
        g.appendChild(commentIndicator);
      }
      
      // Attachment count badge
      if (node.attachments && node.attachments.length > 0) {
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badge.innerHTML = `
          <circle cx="${-node.width/2 + 12}" cy="${node.height/2 - 12}" r="10" fill="var(--gauss-green)"/>
          <text x="${-node.width/2 + 12}" y="${node.height/2 - 8}" 
                text-anchor="middle" fill="white" font-size="10" font-weight="700">
            ${node.attachments.length}
          </text>
        `;
        g.appendChild(badge);
      }
      
      // Collapse button
      const descendants = this.getAllDescendants(node);
      if (descendants.length > 0) {
        const collapseBtn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        collapseBtn.classList.add('node-collapse-btn');
        collapseBtn.innerHTML = `
          <circle cx="${node.width/2 - 12}" cy="${-node.height/2 + 12}" r="10" 
                  fill="${node.collapsed ? 'var(--gauss-green)' : 'var(--ink-600)'}" 
                  stroke="white" stroke-width="2"/>
          <text x="${node.width/2 - 12}" y="${-node.height/2 + 16}" 
                text-anchor="middle" fill="white" font-size="14" font-weight="bold">
            ${node.collapsed ? '+' : '−'}
          </text>
        `;
        collapseBtn.style.cursor = 'pointer';
        collapseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleNodeCollapse(node);
        });
        g.appendChild(collapseBtn);
        
        // Collapsed count badge
        if (node.collapsed) {
          const countBadge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          countBadge.innerHTML = `
            <rect x="${node.width/2 - 30}" y="${node.height/2 - 10}" width="28" height="16" 
                  rx="8" fill="var(--gauss-green)"/>
            <text x="${node.width/2 - 16}" y="${node.height/2 - 2}" 
                  text-anchor="middle" fill="white" font-size="10" font-weight="600">
              ${descendants.length}
            </text>
          `;
          g.appendChild(countBadge);
        }
      }
      
      this.nodesLayer.appendChild(g);
    });
  }
  
  renderConnections() {
    this.connectionsLayer.innerHTML = '';
    
    this.connections.forEach(conn => {
      const fromNode = this.nodes.find(n => n.id === conn.from);
      const toNode = this.nodes.find(n => n.id === conn.to);
      
      if (!fromNode || !toNode) return;
      if (!this.isNodeVisible(fromNode) || !this.isNodeVisible(toNode)) return;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('connection-line');
      if (this.selectedConnection?.id === conn.id) path.classList.add('selected');
      
      const x1 = fromNode.x;
      const y1 = fromNode.y + fromNode.height/2;
      const x2 = toNode.x;
      const y2 = toNode.y - toNode.height/2;
      
      const midY = (y1 + y2) / 2;
      
      const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
      path.setAttribute('d', d);
      
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedConnection = conn;
        this.selectedNode = null;
        this.hideActionsPanel();
        this.render();
      });
      
      this.connectionsLayer.appendChild(path);
      
      if (conn.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.classList.add('connection-label');
        text.setAttribute('x', x2);
        text.setAttribute('y', midY - 5);
        text.setAttribute('text-anchor', 'middle');
        text.textContent = conn.label;
        this.connectionsLayer.appendChild(text);
      }
    });
  }
  
  createWrappedText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length * 7 > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    
    const lineHeight = 16;
    const startY = -(lines.length - 1) * lineHeight / 2;
    
    return lines.map((line, i) => 
      `<tspan x="0" dy="${i === 0 ? startY : lineHeight}">${line}</tspan>`
    ).join('');
  }
  
  // ============================================================
  // TRANSFORM & ZOOM
  // ============================================================
  applyTransform() {
    this.nodesLayer.setAttribute('transform', 
      `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.scale})`
    );
    this.connectionsLayer.setAttribute('transform', 
      `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.scale})`
    );
    
    document.getElementById('zoomIndicator').textContent = 
      `${Math.round(this.transform.scale * 100)}%`;
  }
  
  zoom(delta, centerX, centerY) {
    const oldScale = this.transform.scale;
    this.transform.scale = Math.max(0.1, Math.min(3, this.transform.scale * delta));
    
    if (centerX && centerY) {
      const rect = this.canvasContainer.getBoundingClientRect();
      const x = centerX - rect.left;
      const y = centerY - rect.top;
      
      this.transform.x = x - (x - this.transform.x) * (this.transform.scale / oldScale);
      this.transform.y = y - (y - this.transform.y) * (this.transform.scale / oldScale);
    }
    
    this.applyTransform();
  }
  
  fitToView() {
    const visibleNodes = this.nodes.filter(n => this.isNodeVisible(n));
    if (visibleNodes.length === 0) return;
    
    const padding = 50;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    visibleNodes.forEach(node => {
      minX = Math.min(minX, node.x - node.width/2);
      minY = Math.min(minY, node.y - node.height/2);
      maxX = Math.max(maxX, node.x + node.width/2);
      maxY = Math.max(maxY, node.y + node.height/2);
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    const rect = this.canvasContainer.getBoundingClientRect();
    
    const scaleX = (rect.width - padding * 2) / width;
    const scaleY = (rect.height - padding * 2) / height;
    this.transform.scale = Math.min(scaleX, scaleY, 1);
    
    this.transform.x = (rect.width - width * this.transform.scale) / 2 - minX * this.transform.scale;
    this.transform.y = (rect.height - height * this.transform.scale) / 2 - minY * this.transform.scale;
    
    this.applyTransform();
  }
  
  // ============================================================
  // UTILITIES
  // ============================================================
  getMousePosition(e) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.transform.x) / this.transform.scale,
      y: (e.clientY - rect.top - this.transform.y) / this.transform.scale
    };
  }
  
  getNodeAtPoint(point) {
    return this.nodes.find(node => {
      if (!this.isNodeVisible(node)) return false;
      const dx = Math.abs(point.x - node.x);
      const dy = Math.abs(point.y - node.y);
      return dx < node.width/2 && dy < node.height/2;
    });
  }
  
  updateToolbar() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === this.mode);
    });
  }
  
  handleAction(action) {
    switch(action) {
      case 'connect':
        this.mode = 'connect';
        this.updateToolbar();
        break;
      case 'delete':
        this.deleteSelected();
        break;
      case 'zoom-in':
        this.zoom(1.2);
        break;
      case 'zoom-out':
        this.zoom(0.8);
        break;
      case 'fit':
        this.fitToView();
        break;
    }
  }
  
  generateId() {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // ============================================================
  // PERSISTENCE (WITH MIGRATION)
  // ============================================================
  saveToStorage() {
    const data = {
      version: this.version,
      nodes: this.nodes,
      connections: this.connections,
      transform: this.transform
    };
    localStorage.setItem('gauss_flowchart_data', JSON.stringify(data));
  }
  
  loadFromStorage() {
    try {
      const saved = localStorage.getItem('gauss_flowchart_data');
      
      if (saved) {
        const data = JSON.parse(saved);
        
        // Migrate if needed
        if (!data.version || data.version < this.version) {
          console.log('📦 Migrando dados...');
          this.migrateData(data);
        } else {
          this.nodes = data.nodes || [];
          this.connections = data.connections || [];
          this.transform = data.transform || { x: 0, y: 0, scale: 1 };
        }
        
        // Ensure all nodes have new properties
        this.nodes = this.nodes.map(node => ({
          ...node,
          pinned: node.pinned || false,
          attachments: node.attachments || [],
          comments: node.comments || [],
          collapsed: node.collapsed || false
        }));
        
        this.applyTransform();
        this.saveToStorage();
        
      } else {
        this.createDemoFlowchart();
      }
      
    } catch (error) {
      console.error('❌ Erro ao carregar dados:', error);
      this.showErrorModal();
    }
  }
  
  migrateData(data) {
    this.nodes = (data.nodes || []).map(node => {
      const { children, ...rest } = node;
      return {
        ...rest,
        collapsed: rest.collapsed || false,
        pinned: rest.pinned || false,
        attachments: rest.attachments || [],
        comments: rest.comments || []
      };
    });
    
    this.connections = data.connections || [];
    this.transform = data.transform || { x: 0, y: 0, scale: 1 };
    
    this.showNotification('✅ Dados atualizados!');
  }
  
  showErrorModal() {
    const confirmed = confirm(
      '⚠️ Erro ao carregar dados.\n\nDeseja limpar o cache?'
    );
    
    if (confirmed) {
      this.clearAllData();
      location.reload();
    }
  }
  
  clearAllData() {
    localStorage.removeItem('gauss_flowchart_data');
  }
  
  createDemoFlowchart() {
    const n1 = { 
      id: 'demo1', type: 'start', x: 400, y: 100, width: 160, height: 60, 
      text: 'Início - Pós-Venda', color: '#E6F5EA', collapsed: false, 
      pinned: false, attachments: [], comments: [] 
    };
    const n2 = { 
      id: 'demo2', type: 'process', x: 400, y: 220, width: 180, height: 80, 
      text: 'Receber solicitação', color: '#FFFFFF', collapsed: false,
      pinned: false, attachments: [], comments: [] 
    };
    const n3 = { 
      id: 'demo3', type: 'decision', x: 400, y: 360, width: 140, height: 80, 
      text: 'Urgente?', color: '#FFF9E6', collapsed: false,
      pinned: false, attachments: [], comments: [] 
    };
    const n4 = { 
      id: 'demo4', type: 'process', x: 240, y: 480, width: 160, height: 80, 
      text: 'Fila normal', color: '#FFFFFF', collapsed: false,
      pinned: false, attachments: [], comments: [] 
    };
    const n5 = { 
      id: 'demo5', type: 'process', x: 560, y: 480, width: 160, height: 80, 
      text: 'Priorizar', color: '#FFE6E6', collapsed: false,
      pinned: false, attachments: [], comments: [] 
    };
    
    this.nodes = [n1, n2, n3, n4, n5];
    this.connections = [
      { id: 'c1', from: 'demo1', to: 'demo2', label: '' },
      { id: 'c2', from: 'demo2', to: 'demo3', label: '' },
      { id: 'c3', from: 'demo3', to: 'demo4', label: 'Não' },
      { id: 'c4', from: 'demo3', to: 'demo5', label: 'Sim' }
    ];
    
    this.saveToStorage();
  }
  
  startAutoSave() {
    setInterval(() => {
      this.saveToStorage();
    }, 30000);
  }
  
  addToHistory() {
    const state = {
      nodes: JSON.parse(JSON.stringify(this.nodes)),
      connections: JSON.parse(JSON.stringify(this.connections))
    };
    
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(state);
    this.historyIndex++;
    
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIndex--;
    }
  }
  
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const state = this.history[this.historyIndex];
      this.nodes = JSON.parse(JSON.stringify(state.nodes));
      this.connections = JSON.parse(JSON.stringify(state.connections));
      this.render();
      this.broadcastChange();
    }
  }
  
  updateMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#F8FAF8';
    ctx.fillRect(0, 0, w, h);
    
    const visibleNodes = this.nodes.filter(n => this.isNodeVisible(n));
    if (visibleNodes.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleNodes.forEach(node => {
      minX = Math.min(minX, node.x - node.width/2);
      minY = Math.min(minY, node.y - node.height/2);
      maxX = Math.max(maxX, node.x + node.width/2);
      maxY = Math.max(maxY, node.y + node.height/2);
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    const scale = Math.min(w / width, h / height) * 0.8;
    const offsetX = (w - width * scale) / 2;
    const offsetY = (h - height * scale) / 2;
    
    visibleNodes.forEach(node => {
      const x = (node.x - minX) * scale + offsetX;
      const y = (node.y - minY) * scale + offsetY;
      const nw = node.width * scale;
      const nh = node.height * scale;
      
      ctx.fillStyle = node.pinned ? '#D9534F' : '#39B54A';
      ctx.fillRect(x - nw/2, y - nh/2, nw, nh);
    });
    
    ctx.strokeStyle = '#6B736E';
    ctx.lineWidth = 1;
    this.connections.forEach(conn => {
      const from = this.nodes.find(n => n.id === conn.from);
      const to = this.nodes.find(n => n.id === conn.to);
      if (!from || !to || !this.isNodeVisible(from) || !this.isNodeVisible(to)) return;
      
      const x1 = (from.x - minX) * scale + offsetX;
      const y1 = (from.y - minY) * scale + offsetY;
      const x2 = (to.x - minX) * scale + offsetX;
      const y2 = (to.y - minY) * scale + offsetY;
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }
  
  showNotification(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--ink-900);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: var(--font-body);
      font-size: 14px;
      box-shadow: var(--shadow-lg);
      z-index: 10000;
      animation: slideUp 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

const app = new FlowchartApp();
