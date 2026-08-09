// A IMPLANTAÇÃO DO BACKEND — o deploy que derruba a obra sem dar erro.
//
// `clasp deploy` SEM `-i` não falha: ele cria uma implantação NOVA, com uma
// URL /exec nova, e devolve sucesso. O app continua apontando para a URL
// antiga, que ficou com o código velho. O resultado é uma obra sem backend
// atualizado depois de um deploy "verde".
//
// Este teste lê os dois caminhos de implantação (o fluxo do GitHub e o script
// local) e exige que os dois passem o id da implantação existente.
//
// Como rodar:  node tests/implantacao.test.js
const fs = require('fs');
const path = require('path');

let falhas = 0;
const ok = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { falhas++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + e : '')); } };

const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');

const fluxo = ler('.github/workflows/implantar-appscript.yml');
const script = ler('ferramentas/implantar-appscript.sh');
const claspignore = ler('.claspignore');

console.log('\nA MESMA URL DE SEMPRE');
{
  // Toda chamada de `clasp deploy`, nos dois arquivos, tem de trazer -i.
  const chamadas = [];
  [['fluxo', fluxo], ['script', script]].forEach(([onde, txt]) => {
    txt.split('\n').forEach((linha, i) => {
      // Só linha de comando: comentário que fala de deploy não conta.
      const semComentario = linha.replace(/^\s*#.*/, '');
      if (/\bclasp\s+deploy\b/.test(semComentario)) chamadas.push({ onde, n: i + 1, linha: semComentario.trim() });
    });
  });
  ok('achou as chamadas de clasp deploy', chamadas.length === 2, JSON.stringify(chamadas.map(c => c.onde)));
  const semId = chamadas.filter(c => !/\s-i\s/.test(c.linha));
  ok('toda implantação reusa o id existente (-i)', semId.length === 0,
     JSON.stringify(semId.map(c => c.onde + ':' + c.n + ' ' + c.linha)));
}

console.log('\nNÃO PUBLICAR SEM SABER PARA ONDE');
{
  ok('o fluxo exige APPSCRIPT_DEPLOYMENT_ID', /APPSCRIPT_DEPLOYMENT_ID/.test(fluxo));
  ok('e para quando ele falta, em vez de criar outra implantação',
     /pronto=nao/.test(fluxo) && /DEPLOY_ID/.test(fluxo));
  ok('o script local também para sem o id', /Falta o id da implantação/.test(script));
}

console.log('\nNÃO APAGAR CÓDIGO QUE SÓ EXISTE NO PROJETO');
{
  // `clasp push -f` deixa o projeto igual à pasta: o que sobra é apagado.
  ok('o fluxo usa push -f (é o que apaga)', /clasp push -f/.test(fluxo));
  ok('e confere antes se algo seria apagado',
     /clasp pull/.test(fluxo) && /apagaria/i.test(fluxo));
  ok('o script local faz a mesma conferência',
     /clasp pull/.test(script) && /apagaria/i.test(script));
}

console.log('\nCode.gs E Code.js SÃO O MESMO ARQUIVO');
{
  /* No Apps Script o arquivo não tem extensão: quem põe é o clasp ao baixar,
     e por padrão ele escreve .js. O repositório guarda .gs. Comparar os nomes
     crus daria "Code.js seria apagado" na primeira execução — um falso alarme
     que travaria toda implantação sem nada de errado no projeto. */
  ok('o clasp é configurado para baixar como .gs',
     /"fileExtension"\s*:\s*"gs"/.test(fluxo), 'falta fileExtension no .clasp.json do fluxo');
  ok('e a comparação ignora a extensão de qualquer jeito',
     /\$\{nome%\.\*\}/.test(fluxo) && /\$\{nome%\.\*\}/.test(script),
     'os dois têm de comparar pelo nome sem extensão');

  // Roda a lógica de verdade, com os dois nomes, num diretório de mentira.
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'impl-'));
  const projeto = path.join(tmp, 'atual'), repo = path.join(tmp, 'repo');
  fs.mkdirSync(projeto); fs.mkdirSync(repo);
  // o projeto voltou com .js; o repositório tem .gs — e um arquivo a mais lá
  fs.writeFileSync(path.join(projeto, 'Code.js'), '//');
  fs.writeFileSync(path.join(projeto, 'antigo.js'), '//');
  fs.writeFileSync(path.join(repo, 'Code.gs'), '//');

  const logica = `
    sobrando=""
    for f in ${projeto}/*.gs ${projeto}/*.js ${projeto}/*.html; do
      [ -e "$f" ] || continue
      nome=$(basename "$f"); raiz="\${nome%.*}"; achou=0
      for ext in gs js html; do [ -e "${repo}/$raiz.$ext" ] && achou=1; done
      [ "$achou" = "1" ] || sobrando="$sobrando $nome"
    done
    echo "$sobrando"`;
  const saida = execFileSync('bash', ['-c', logica]).toString().trim();
  ok('Code.js do projeto casa com o Code.gs do repositório', saida.indexOf('Code.js') === -1, saida);
  ok('e o arquivo que só existe no projeto continua sendo acusado',
     saida.indexOf('antigo.js') > -1, saida);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\nNÃO SOBRESCREVER O MANIFESTO COM UM INVENTADO');
{
  // appsscript.json guarda fuso, escopos de OAuth e a configuração do app da
  // web. Um manifesto chutado reconfigura o backend em produção.
  ok('o fluxo para se o appsscript.json não estiver no repositório',
     /Falta o appsscript\.json/.test(fluxo));
  ok('o script local também', /Falta o appsscript\.json/.test(script));
  ok('e o manifesto NÃO foi inventado neste repositório',
     !fs.existsSync(path.join(raiz, 'appsscript.json')) ||
     /"timeZone"/.test(ler('appsscript.json')),
     'se existe, tem de ter vindo de um clasp pull');
}

console.log('\nO QUE SOBE É SÓ O BACKEND');
{
  ok('a lista começa excluindo tudo', /^\*\*\/\*\*$/m.test(claspignore));
  ['Code.gs', 'limpar_duplicados.gs', 'appsscript.json'].forEach(f =>
    ok(`e reabre exceção para ${f}`, claspignore.indexOf('!' + f) > -1));
  ok('o index.html NÃO é reaberto (são 800 KB que não são backend)',
     claspignore.indexOf('!index.html') === -1);
}

console.log('\nA CREDENCIAL NÃO FICA PARA TRÁS');
{
  ok('o fluxo apaga o ~/.clasprc.json no fim', /rm -f "\$HOME\/\.clasprc\.json"/.test(fluxo));
  ok('e apaga mesmo quando a implantação falha', /if: always\(\)/.test(fluxo));
  const gitignore = ler('.gitignore');
  ok('.clasprc.json está no .gitignore (é o token do Google)', /\.clasprc\.json/.test(gitignore), gitignore);
  ok('.clasp.json também (é o id do projeto, e o clasp o reescreve)', /\.clasp\.json/.test(gitignore), gitignore);
  ok('a credencial não está versionada por engano',
     !fs.existsSync(path.join(raiz, '.clasprc.json')));
}

console.log('\nA VERSÃO DO CLASP ESTÁ PRESA');
{
  // A 3.x mudou o lugar do arquivo de credencial e a sintaxe dos comandos:
  // "instalar a última" quebraria a implantação num dia qualquer, sozinho.
  ok('o fluxo instala uma versão exata', /@google\/clasp@\d+\.\d+\.\d+/.test(fluxo),
     (fluxo.match(/@google\/clasp@[^\s]*/) || [''])[0]);
}

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} FALHA(S)\n`);
process.exit(falhas === 0 ? 0 : 1);
