const fs = require('fs');
const path = 'src/server/index.ts';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<aside>')) {
        console.log('Fixing sidebar at line ' + i);
        lines[i + 1] = '    <div class="logo">PREDIZ<span>COPY</span></div>';
        lines[i + 2] = '    <div class="nav">';
        lines[i + 3] = '      <div id="nav-bot" class="nav-item active" onclick="switchTab(\'bot\')"><span>&#129302;</span> Meu Rob&ocirc;</div>';
        lines[i + 4] = '      <div id="nav-positions" class="nav-item" onclick="switchTab(\'positions\')"><span>&#128202;</span> Posi&ccedil;&otilde;es Abertas</div>';
        lines[i + 5] = '      <div id="nav-config" class="nav-item" onclick="switchTab(\'config\')"><span>&#9881;</span> Configura&ccedil;&otilde;es</div>';
        lines[i + 6] = '      <div class="nav-item" onclick="logout()" style="margin-top: 40px"><span>&#128683;</span> Sair</div>';
        lines[i + 7] = '    </div>';
        lines[i + 8] = '  </aside>';
    }
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Global Sidebar fix completed');
