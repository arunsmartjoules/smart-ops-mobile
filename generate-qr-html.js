const fs = require('fs');
const jsqr = fs.readFileSync('node_modules/jsqr/dist/jsQR.js', 'utf8');

const decoderScript = `
document.addEventListener('message', function(e) { decode(e.data); });
window.addEventListener('message', function(e) { decode(e.data); });
function decode(base64) {
  var img = new Image();
  img.onload = function() {
    var canvas = document.getElementById('c');
    canvas.width = img.width;
    canvas.height = img.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var imageData = ctx.getImageData(0, 0, img.width, img.height);
    var code = jsQR(imageData.data, imageData.width, imageData.height);
    window.ReactNativeWebView.postMessage(JSON.stringify({ result: code ? code.data : null }));
  };
  img.onerror = function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({ error: 'load_failed' }));
  };
  img.src = 'data:image/jpeg;base64,' + base64;
}
`;

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body>
<canvas id="c" style="display:none"></canvas>
<script>${jsqr}</script>
<script>${decoderScript}</script>
</body>
</html>`;

fs.writeFileSync('assets/qr-decoder.html', html);
console.log('Generated assets/qr-decoder.html (' + html.length + ' bytes)');
