import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { attachGameServer } from './events';
import { loadDictionary } from './dictionary';

// 3100 by default (3000 is commonly taken by Docker/orbstack);
// override with SCRABBLE_PORT.
const PORT = Number(process.env.SCRABBLE_PORT ?? 3100);

const dictionary = loadDictionary();
console.log(`loaded dictionary: ${dictionary.size.toLocaleString()} words`);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
attachGameServer(io, dictionary);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`scrabble server listening on :${PORT}`);
});
