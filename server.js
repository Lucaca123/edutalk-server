const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
 
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
 
app.get('/', (req, res) => res.send('EduTalk Server OK'));
 
const queue = { eleve: [], prof: [] };
const pairs = {};
 
io.on('connection', (socket) => {
  console.log('+ connecté:', socket.id);
 
  // Recherche d'un partenaire
  socket.on('search', (data) => {
    const myRole = data.role;
    const opposite = myRole === 'eleve' ? 'prof' : 'eleve';
 
    socket.data = {
      name:  data.name  || 'Anonyme',
      level: data.level || '?',
      role:  myRole
    };
 
    console.log(`[SEARCH] ${socket.data.name} role=${myRole}`);
 
    if (queue[opposite].length > 0) {
      const partner = queue[opposite].shift();
      pairs[socket.id]  = partner.id;
      pairs[partner.id] = socket.id;
 
      console.log(`[MATCH] ${socket.data.name} <-> ${partner.data.name}`);
 
      // Initiateur = celui qui vient d'arriver, il envoie l'offre WebRTC
      socket.emit('matched', {
        partnerSocketId: partner.id,
        partnerName:     partner.data.name,
        partnerLevel:    partner.data.level,
        partnerRole:     opposite,
        initiator:       true
      });
 
      io.to(partner.id).emit('matched', {
        partnerSocketId: socket.id,
        partnerName:     socket.data.name,
        partnerLevel:    socket.data.level,
        partnerRole:     myRole,
        initiator:       false
      });
 
    } else {
      queue[myRole].push(socket);
      socket.emit('waiting', { position: queue[myRole].length });
      console.log(`[WAIT] ${socket.data.name} (${myRole}) pos=${queue[myRole].length}`);
    }
  });
 
  // Relais signaux WebRTC (offer/answer/ice) directement par socket
  socket.on('rtc_signal', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('rtc_signal', { signal: data.signal });
    }
  });
 
  // Chat texte
  socket.on('chat', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('chat', {
        text: data.text,
        name: data.name,
        role: data.role
      });
    }
  });
 
  socket.on('skip',       () => cleanup(socket));
  socket.on('disconnect', () => cleanup(socket));
 
  function cleanup(s) {
    queue.eleve = queue.eleve.filter(x => x.id !== s.id);
    queue.prof  = queue.prof.filter(x => x.id !== s.id);
    const pid = pairs[s.id];
    if (pid) {
      io.to(pid).emit('partner_left');
      delete pairs[pid];
    }
    delete pairs[s.id];
    console.log('- déconnecté:', s.id);
  }
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`EduTalk Server OK port ${PORT}`));
