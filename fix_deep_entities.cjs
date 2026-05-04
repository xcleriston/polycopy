const fs = require('fs');
const path = 'src/server/index.ts';
let content = fs.readFileSync(path, 'utf8');

const replacements = [
    [/PosiÃ§Ãµes Abertas/g, 'Posi&ccedil;&otilde;es Abertas'],
    [/ConfiguraÃ§Ãµes AvanÃ§adas/g, 'Configura&ccedil;&otilde;es Avan&ccedil;adas'],
    [/Atividades Recentes/g, 'Atividades Recentes'],
    [/Saldo DisponÃ­vel/g, 'Saldo Dispon&iacute;vel'],
    [/Volume em PosiÃ§Ãµes/g, 'Volume em Posi&ccedil;&otilde;es'],
    [/ConfiguraÃ§Ãµes do Bot/g, 'Configura&ccedil;&otilde;es do Bot'],
    [/Nenhum/g, 'Nenhum'],
    [/Desconhecido/g, 'Desconhecido'],
    [/Carregando posiÃ§Ãµes/g, 'Carregando posi&ccedil;&otilde;es'],
    [/Modo de OperaÃ§Ã£o/g, 'Modo de Opera&ccedil;&atilde;o'],
    [/EstratÃ©gia/g, 'Estrat&eacute;gia'],
    [/Tipo de Ordem/g, 'Tipo de Ordem'],
    [/PreÃ§o MÃ­nimo/g, 'Pre&ccedil;o M&iacute;nimo'],
    [/PreÃ§o MÃ¡ximo/g, 'Pre&ccedil;o M&aacute;ximo']
];

replacements.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
});

fs.writeFileSync(path, content, 'utf8');
console.log('Deep HTML Entity fix completed');
