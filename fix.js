const fs = require('fs');
let t = fs.readFileSync('public/index.html', 'utf8');
t = t.replace(/<<<<<<< HEAD[\s\S]*?=======\r?\n/, '');
t = t.replace(/>>>>>>> 7d0e6f83a4474f60e7b2f653ca4e06bea4fe1e82\r?\n/, '');
t = t.replace('btn.disabled = loading;', 'if (btn) btn.disabled = loading;');
t = t.replace('spin.classList.toggle("show", loading);', 'if (spin) spin.classList.toggle("show", loading);');
t = t.replace('txt.style.display = loading ? "none" : "block";', 'if (txt) txt.style.display = loading ? "none" : "block";');
fs.writeFileSync('public/index.html', t);
