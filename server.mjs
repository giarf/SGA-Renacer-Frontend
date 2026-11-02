import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        await serveStatic(req, res, url);
    } catch (error) {
        console.error(error);
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Error interno del servidor');
    }
});

server.listen(port, '0.0.0.0', () => {
    console.log(`SGA Renacer disponible en http://0.0.0.0:${port}`);
});

async function serveStatic(req, res, url) {
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
        res.writeHead(405, { allow: 'GET, HEAD' });
        res.end();
        return;
    }

    const requestedPath = decodeURIComponent(url.pathname);
    const filePath = getStaticFilePath(requestedPath);
    const safeDist = `${distDir}${path.sep}`;

    if (!filePath.startsWith(safeDist) && filePath !== distDir) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Prohibido');
        return;
    }

    const finalPath = existsSync(filePath) && (await stat(filePath)).isFile()
        ? filePath
        : path.join(distDir, 'index.html');

    res.writeHead(200, {
        'content-type': contentType(finalPath),
        'cache-control': finalPath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable'
    });

    if (req.method === 'HEAD') {
        res.end();
        return;
    }

    createReadStream(finalPath).pipe(res);
}

function getStaticFilePath(requestedPath) {
    const normalized = path.normalize(requestedPath === '/' ? '/index.html' : requestedPath).replace(/^([.][.][/\\])+/, '');
    return path.join(distDir, normalized);
}

function contentType(filePath) {
    if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
    if (filePath.endsWith('.svg')) return 'image/svg+xml';
    if (filePath.endsWith('.png')) return 'image/png';
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
    if (filePath.endsWith('.ico')) return 'image/x-icon';
    return 'application/octet-stream';
}
