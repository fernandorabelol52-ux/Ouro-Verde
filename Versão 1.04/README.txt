================================================================================
  MENU DIGITAL — AÇOUGUE OURO VERDE
  Versão 1.03 — setembro/2026
================================================================================

Este arquivo tem duas partes:

  PARTE 1 — GUIA DE USO (para quem opera o açougue)
  PARTE 2 — DOCUMENTAÇÃO TÉCNICA (para quem mantém o código)


================================================================================
PARTE 1 — GUIA DE USO
================================================================================

1.1  O QUE É
------------
Um painel de preços que roda na TV do açougue. Ele mostra, em rotação
automática, uma tela para cada categoria de produto (Bovinos, Suínos, Aves,
Miúdos, Frios, Linguiças, Espetos) e, quando houver, telas de "Ofertas do Dia".

Cada tela fica 12 segundos no ar. Os preços vêm de uma planilha Google; as
fotos vêm de um painel de administração. Nada precisa ser instalado na TV.

1.2  ENDEREÇOS
--------------
  TV (cardápio):            https://ouro-verde-seven.vercel.app
  TV sem tela de ofertas:   https://ouro-verde-seven.vercel.app/sem-promo
  Painel de fotos (admin):  https://ouro-verde-seven.vercel.app/admin/admin

  Planilha de preços: aba "MENU" da planilha Google compartilhada com o açougue.

1.3  COMO LIGAR A TV
--------------------
  1. Abra o navegador da Smart TV (ou de um PC ligado na TV).
  2. Acesse o endereço da TV acima.
  3. Coloque em tela cheia (na maioria dos navegadores: tecla F11 no PC, ou a
     opção "Tela cheia" no menu do navegador da TV).
  4. Pronto. A página se atualiza sozinha e se adapta ao tamanho da tela.

  Se a TV ligar antes da internet conectar, aparece "Conectando ao cardápio…".
  Ela tenta de novo sozinha a cada 30 segundos; não precisa fazer nada.

1.4  COMO MUDAR UM PREÇO
------------------------
  1. Abra a planilha Google, aba MENU.
  2. Altere o valor na coluna "Preço Base".
  3. Aguarde. A TV busca a planilha a cada 5 minutos, e o Google leva até
     5 minutos para publicar a alteração. Ou seja: a mudança aparece na TV
     em até 10 minutos. Não é preciso recarregar nada.

  Colunas da planilha (não mude a ordem nem os títulos):

    A  Categoria       Bovinos / Suínos / Aves / Miúdos / Frios / Linguiças /
                       Espetos. Aceita com ou sem acento, maiúsculas ou
                       minúsculas, e variações como "Frango" (= Aves) ou
                       "Miúdos (Bovinos)" (= Miúdos). Qualquer outro nome faz
                       o item NÃO aparecer na TV.
    B  Nome do Corte   Texto que aparece na TV.
    C  Preço Base      Preço normal, ex.: 36,90
    D  Desconto        Valor (em reais) do desconto, só para promoções.
    E  Preço Final     Pode deixar em branco: a TV calcula (C − D) quando é
                       promoção, ou usa o Preço Base.
    F  Promoção?       SIM ou NÃO. Com SIM e Desconto > 0, o item fica em
                       vermelho com o preço antigo riscado E entra na tela
                       "Ofertas do Dia".
    G  Visível na TV?  SIM ou NÃO. NÃO esconde o item (para produtos em falta).
                       Se todos os itens de uma categoria estiverem em NÃO, a
                       tela daquela categoria simplesmente não aparece.

  Espetos são mostrados como "/un"; todo o resto como "/kg".

1.5  COMO TROCAR A FOTO DE UMA CATEGORIA
----------------------------------------
  1. Abra o painel de fotos (endereço em 1.2) no computador.
  2. Na primeira vez, clique em "Configurar token" e cole o token do GitHub
     (fornecido pelo responsável técnico). Ele fica salvo só nesse navegador.
  3. Clique na foto da categoria (ou em "Adicionar foto") e escolha a imagem.
     - Prefira fotos VERTICAIS (em pé). A coluna da TV é vertical.
     - Pode ser foto de celular: o painel reduz o tamanho automaticamente.
  4. Ajuste os controles de posição (←→ ↑↓) e zoom (🔍) até a prévia ficar boa.
     A prévia tem a mesma proporção da coluna na TV.
  5. Clique em "💾 Salvar no Site". Aguarde a mensagem de confirmação.
  6. A TV mostra a nova foto em 1–5 minutos (na próxima atualização).

  Para só reposicionar uma foto existente: mexa nos controles e clique em
  "Salvar no Site" — não precisa enviar a imagem de novo.

  Para remover: passe o mouse sobre a foto e clique no "✕", depois salve.

1.6  PROBLEMAS COMUNS
---------------------
  Selo "Erro de conexão" no canto da TV
      A TV não conseguiu ler a planilha. Verifique a internet. Os últimos
      preços continuam na tela até a conexão voltar.

  Um produto sumiu da TV
      Veja na planilha: coluna G está "NÃO"? Coluna A está escrita certa?
      Nome do corte em branco?

  A tela de Ofertas não aparece
      Só aparece se houver pelo menos um item com Promoção = SIM e
      Desconto > 0. No endereço /sem-promo ela nunca aparece.

  A foto nova não apareceu
      Espere até 5 minutos. Se o painel mostrou erro ao salvar, o token pode
      ter expirado — peça um novo ao responsável técnico.

  A página está cortada ou pequena na TV
      Coloque o navegador em tela cheia. A página se redimensiona sozinha.


================================================================================
PARTE 2 — DOCUMENTAÇÃO TÉCNICA
================================================================================

2.1  ARQUITETURA
----------------
  Site estático, sem backend. Três fontes de dados:

    Planilha Google (CSV publicado)  --->  app.js  --->  TV (index.html)
    fotos.json (no repositório)      --->  app.js
    admin/admin.html  --(GitHub REST API)-->  grava imagens/ e fotos.json
                                                       |
                                                       v
                                        push no GitHub -> deploy Vercel (~60 s)

  Hospedagem: Vercel, projeto "candiru0-s-projects/ouro-verde", deploy
  automático a cada push na branch main. O "Root Directory" do projeto na
  Vercel aponta para a pasta da versão ativa (Versão 1.03/).

  Repositório: github.com/fernandorabelol52-ux/Ouro-Verde (público).

2.2  VERSIONAMENTO
------------------
  Cada versão vive numa pasta própria na raiz do repositório (Versão 1.0/,
  Versão 1.01/, Versão 1.02/, Versão 1.03/). Regra: NUNCA editar a pasta de
  uma versão anterior. Para uma nova versão:
    1. copiar a pasta atual para "Versão X.YY/";
    2. atualizar GITHUB_CONFIG.fotosJsonPath e imagensPath no admin;
    3. atualizar as URLs em fotos.json;
    4. trocar o Root Directory na Vercel.

2.3  ARQUIVOS DA VERSÃO 1.03
----------------------------
  index.html        Casca da TV: header, wrapper de slides (vazio), footer.
                    Os slides são gerados por app.js.
  sem-promo.html    Idêntico, mas define window.MODO_SEM_PROMO = true antes
                    de carregar app.js (desliga a tela de ofertas).
  app.js            Toda a lógica da TV (ver 2.4).
  style-v3.css      Estilos da TV. Layout base 1920×1080.
  fotos.json        Fotos de categoria: URL, posição (object-position) e zoom.
                    Escrito pelo admin; lido pela TV.
  logo.png          Logo (header, favicon, fallback de foto, tela de erro).
  imagens/          Fotos das categorias (cat-<categoria>.jpeg).
  admin/admin.html  Painel de fotos (ver 2.5).
  vercel.json       { "cleanUrls": true } — permite /sem-promo e /admin/admin.
  README.txt        Este arquivo.

2.4  app.js — FLUXO
-------------------
  Constantes principais:
    SHEET_CSV_URL       CSV publicado da aba MENU (gid=1408167426).
    INTERVALO_MINUTOS   5   — frequência de releitura da planilha.
    SLIDE_DURATION_MS   12000 — tempo de cada tela.
    RETRY_INICIAL_MS    30000 — retry enquanto a primeira carga falhar.
    ITENS_POR_COLUNA    16  — acima disso a categoria usa 2 colunas;
                              acima de 32, quebra em várias telas.
    CATEGORIAS_CONFIG   ordem, rótulo, cor do header e apelidos aceitos.

  Ciclo:
    ajustarEscala()      -> calcula scale = min(vw/1920, vh/1080) e aplica
                            transform no <body>. Reexecuta em resize.
    carregarDados()      -> carregarFotos() (fotos.json) + fetch do CSV
                         -> parsearCSV()   (tolera aspas, \r, acentos em SIM/NÃO)
                         -> resolverCategoria() para cada item (sem acento,
                            minúsculas, aceita prefixo: "miudos (bovinos)")
                         -> categorias não reconhecidas: console.warn
                         -> construirSlides(dados): reconstrói o DOM
                            (pula categorias sem itens; promos em telas de 2)
                         -> renderDots(), reinicia timer.
                         Em falha na PRIMEIRA carga: mostrarAvisoConexao() e
                         retry em 30 s. Em falha nas seguintes: mantém a tela
                         anterior e marca "Erro de conexão".
    goToSlide(id)        -> cross-fade de 0,8 s entre slides. Se uma releitura
                            chegar no meio da transição, o rebuild é adiado
                            (pendingRender) para depois do fade.
    injetarFotosColuna() -> foto de categoria (fotos.json) com object-position
                            e transform: scale(zoom). Cache-bust por
                            ?v=<versao do fotos.json>. Se a categoria não tiver
                            foto, usa fotos por corte (FOTOS_MAP) ou o logo.

  Layouts (style-v3.css):
    .s1-layout        1 coluna: foto 480px | header + lista.
    .s-duplo-layout   2 colunas: header | foto 480px | lista A | lista B.
    .ofv2-layout      Ofertas do dia: 1 ou 2 cards grandes por tela.
    .aviso-conexao    Tela de "Conectando ao cardápio…".

2.5  admin/admin.html — FLUXO
-----------------------------
  GITHUB_CONFIG   owner/repo/branch e os caminhos de fotos.json e imagens/
                  DA VERSÃO ATIVA. encodePath() codifica cada segmento do
                  caminho separadamente (necessário por causa do "ã").
  Token           Personal Access Token do GitHub, salvo em localStorage
                  ("gh_token_acougue"). Nunca vai para o repositório.
  Upload          Ao escolher um arquivo, redimensionarImagem() reduz o lado
                  maior para IMG_MAX_LADO (1800 px) e converte para JPEG
                  (qualidade IMG_QUALIDADE = 0,82) usando canvas, respeitando
                  a orientação EXIF. Preview usa a imagem já reduzida.
  Salvar no Site  1) relê fotos.json pela API (evita sobrescrever alteração
                  de outra pessoa); 2) faz PUT de cada imagem nova em
                  imagens/cat-<slug>.jpeg; 3) aplica remoções e ajustes de
                  posição/zoom; 4) faz PUT do fotos.json com "versao" nova.
  Fotos por corte A seção "Fotos por Corte" está oculta
                  (MOSTRAR_FOTOS_POR_CORTE = false). O código continua
                  funcional; basta trocar para true para reexibir.

2.6  SEGURANÇA
--------------
  - O admin é público, mas sem token não grava nada.
  - Use token fine-grained restrito ao repositório Ouro-Verde com a permissão
    "Contents: Read and write" e prazo de validade. Ao expirar, gere outro e
    cole no admin.
  - Se um token vazar (commit, print, chat), revogue imediatamente em
    GitHub > Settings > Developer settings > Personal access tokens.

2.7  MUDANÇAS DA 1.03 (em relação à 1.02)
----------------------------------------
  app.js
    - Categoria sem itens visíveis não gera mais slide em branco.
    - Falha na primeira carga: tela "Conectando…" + retry a cada 30 s.
    - goToSlide não deixa mais a rotação parada em estado inconsistente.
    - Categorias comparadas sem acento/caixa, com apelidos (Frango = Aves)
      e sufixos ("Miúdos (Bovinos)"); não reconhecidas viram console.warn.
    - Escala automática do layout 1920×1080 para qualquer viewport.
  style-v3.css
    - html/body separados para a escala; estilos da tela de conexão.
  admin/admin.html
    - Caminhos apontam para Versão 1.03/.
    - Redimensionamento automático de imagens antes do upload.
    - Seção de fotos por corte oculta; rótulos "Slide N" corrigidos;
      texto do token atualizado.
  imagens/
    - 5 fotos recomprimidas (≈11,5 MB → ≈1,1 MB no total); 4 arquivos órfãos
      da 1.02 não foram trazidos.
  fotos.json
    - URLs apontando para Versão 1.03/imagens/.
  README.txt
    - Novo.
