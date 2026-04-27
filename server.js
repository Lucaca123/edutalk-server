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
  console.log('Connecté:', socket.id);
 
  socket.on('search', (data) => {
    const myRole = data.role;
    const oppositeRole = myRole === 'eleve' ? 'prof' : 'eleve';
 
    socket.data.profile = {
      name:   data.name   || 'Anonyme',
      level:  data.level  || '?',
      peerId: data.peerId || null,
      role:   myRole
    };
 
    console.log(`[SEARCH] ${data.name} (${myRole}) peerId=${data.peerId}`);
 
    if (queue[oppositeRole].length > 0) {
      const partner = queue[oppositeRole].shift();
 
      pairs[socket.id] = partner.id;
      pairs[partner.id] = socket.id;
 
      console.log(`[MATCH] ${data.name} <-> ${partner.data.profile.name}`);
 
      socket.emit('matched', {
        partnerId:    partner.data.profile.peerId,
        partnerName:  partner.data.profile.name,
        partnerLevel: partner.data.profile.level,
        partnerRole:  oppositeRole,
        initiator:    true
      });
 
      io.to(partner.id).emit('matched', {
        partnerId:    socket.data.profile.peerId,
        partnerName:  data.name,
        partnerLevel: data.level,
        partnerRole:  myRole,
        initiator:    false
      });
 
    } else {
      queue[myRole].push(socket);
      socket.emit('waiting', { position: queue[myRole].length });
      console.log(`[WAIT] ${data.name} (${myRole}) — file: ${queue[myRole].length}`);
    }
  });
 
  socket.on('chat', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('chat', { text: data.text, name: data.name, role: data.role });
    }
  });
 
  socket.on('skip', () => cleanup(socket));
  socket.on('disconnect', () => cleanup(socket));
 
  function cleanup(s) {
    queue.eleve = queue.eleve.filter(x => x.id !== s.id);
    queue.prof  = queue.prof.filter(x => x.id !== s.id);
    const partnerId = pairs[s.id];
    if (partnerId) {
      io.to(partnerId).emit('partner_left');
      delete pairs[partnerId];
    }
    delete pairs[s.id];
    console.log('Déconnecté:', s.id);
  }
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`EduTalk Server lancé port ${PORT}`));
