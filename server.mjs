import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);
const authentikBaseUrl = (process.env.AUTHENTIK_PROXY_TARGET || 'https://auth.slaksis.com').replace(/\/+$/, '');

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        if (url.pathname.startsWith('/authentik-api/')) {
            await proxyAuthentik(req, res, url);
            return;
        }

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

async function proxyAuthentik(req, res, url) {
    const targetPath = url.pathname.replace(/^\/authentik-api/, '') || '/';
    const targetUrl = new URL(`${targetPath}${url.search}`, authentikBaseUrl);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
        if (!value || ['host', 'connection', 'content-length'].includes(key.toLowerCase())) continue;
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : req,
        duplex: 'half'
    });

    const responseHeaders = Object.fromEntries(response.headers.entries());
    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];

    res.writeHead(response.status, responseHeaders);
    if (req.method === 'HEAD') {
        res.end();
        return;
    }

    if (!response.body) {
        res.end();
        return;
    }

    const reader = response.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
    }
    res.end();
}

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
