const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.get('/', (req, res) => res.send('EduTalk Server OK'));

// Files d'attente séparées : élèves cherchent un prof, profs cherchent un élève
const queue = {
  eleve: [], // utilisateurs qui attendent en tant qu'élève
  prof: []   // utilisateurs qui attendent en tant que prof
};

// Paires actives : socketId -> socketId partenaire
const pairs = {};

io.on('connection', (socket) => {
  console.log('Connecté:', socket.id);

  // Un utilisateur cherche un partenaire
  // data = { role: 'eleve' | 'prof', name, level, lang }
  socket.on('search', (data) => {
    const myRole = data.role;
    const oppositeRole = myRole === 'eleve' ? 'prof' : 'eleve';

    socket.data.profile = { ...data, id: socket.id };

    // Est-ce qu'il y a quelqu'un dans la file opposée ?
    if (queue[oppositeRole].length > 0) {
      // On prend le premier de la file opposée
      const partner = queue[oppositeRole].shift();

      // On les appaire
      pairs[socket.id] = partner.id;
      pairs[partner.id] = socket.id;

      // On notifie les deux
      socket.emit('matched', {
        partnerId: partner.id,
        partnerName: partner.profile.name,
        partnerLevel: partner.profile.level,
        partnerRole: oppositeRole,
        initiator: true // Moi j'appelle en premier via PeerJS
      });

      io.to(partner.id).emit('matched', {
        partnerId: socket.id,
        partnerName: data.name,
        partnerLevel: data.level,
        partnerRole: myRole,
        initiator: false
      });

    } else {
      // Personne disponible, on attend dans la file
      queue[myRole].push(socket);
      socket.emit('waiting', { position: queue[myRole].length });
    }
  });

  // Relayer les signaux WebRTC entre les deux partenaires
  socket.on('signal', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('signal', {
        signal: data.signal,
        from: socket.id
      });
    }
  });

  // Message chat texte relayé au partenaire
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

  // Skip / déconnexion
  socket.on('skip', () => cleanup(socket));
  socket.on('disconnect', () => cleanup(socket));

  function cleanup(socket) {
    // Retirer de la file si en attente
    queue.eleve = queue.eleve.filter(s => s.id !== socket.id);
    queue.prof  = queue.prof.filter(s => s.id !== socket.id);

    // Notifier le partenaire si en appel
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner_left');
      delete pairs[partnerId];
    }
    delete pairs[socket.id];

    console.log('Déconnecté:', socket.id);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`EduTalk Server lancé sur le port ${PORT}`));
