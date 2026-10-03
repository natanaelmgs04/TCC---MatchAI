/**
 * Perguntas de escolha por imagem do fluxo "Novo projeto" (novo-projeto.html).
 * Cada opção carrega os estilos que ela representa — usando exatamente o
 * vocabulário de PROJECT_STYLES (dashboard.js / backend projectPreferences.js),
 * porque é isso que o motor de match compara com o portfólio dos arquitetos.
 * Fotos reais do Unsplash, com crédito obrigatório do fotógrafo.
 */
window.MatchStyleQuestions = (() => {
  // Cópias locais (900×640) em assets/img/photos: o site não depende do domínio do Unsplash,
  // que é bloqueado em algumas redes. O crédito ao fotógrafo continua abaixo.
  const img = (path) => `assets/img/photos/${path}-q.webp`;
  const opt = (id, label, path, styles, photographer, username) => ({
    id, label, styles, image: img(path),
    credit: { name: photographer, url: `https://unsplash.com/@${username}?utm_source=matchia&utm_medium=referral` },
  });

  return [
    {
      id: 'sala',
      question: 'Qual sala parece mais com você?',
      hint: 'Escolha pela sensação, não pelos móveis em si.',
      options: [
        opt('sala-moderno', 'Ampla e serena', 'photo-1724582586529-62622e50c0b3', ['Moderno', 'Minimalista'], 'Prydumano Design', 'prydumanodesign'),
        opt('sala-escandinavo', 'Clara e acolhedora', 'photo-1631679706909-1844bbd07221', ['Escandinavo'], 'Spacejoy', 'spacejoy'),
        opt('sala-industrial', 'Loft com madeira e aço', 'photo-1783990349147-906f62b882c1', ['Industrial', 'Contemporâneo'], 'Ulises Ramirez', 'ulises_rplt'),
        opt('sala-classico', 'Elegante e clássica', 'photo-1618221312573-404f9a52798d', ['Clássico', 'Alto padrão'], 'Spacejoy', 'spacejoy'),
      ],
    },
    {
      id: 'cozinha',
      question: 'Em qual cozinha você passaria mais tempo?',
      hint: 'Pense em como você cozinha e recebe as pessoas.',
      options: [
        opt('cozinha-minimalista', 'Limpa, sem puxadores', 'photo-1610276173132-c47d148ab626', ['Minimalista', 'Moderno'], 'Simona Sergi', 'i_am_simoesse'),
        opt('cozinha-rustico', 'Mesa de madeira maciça', 'photo-1628797279405-8cd6ffdbeb6c', ['Rústico'], 'Sosey Interiors', 'soseyinteriors'),
        opt('cozinha-industrial', 'Escura, com escada aparente', 'photo-1768413292179-d958b344f1d4', ['Industrial'], 'Caroline Badran', '___atmos'),
        opt('cozinha-contemporaneo', 'Ilha de mármore e luz', 'photo-1682888813913-e13f18692019', ['Contemporâneo', 'Alto padrão'], 'Zac Gudakov', 'zacgudakov'),
      ],
    },
    {
      id: 'quarto',
      question: 'Onde você descansaria melhor?',
      hint: 'O quarto diz muito sobre o ritmo que você quer em casa.',
      options: [
        opt('quarto-escandinavo', 'Madeira clara e branco', 'photo-1724582586413-6b69e1c94a17', ['Escandinavo', 'Minimalista'], 'Prydumano Design', 'prydumanodesign'),
        opt('quarto-biofilico', 'Plantas e luz natural', 'photo-1592836115175-237e5f25ff93', ['Biofílico'], 'Joana Abreu', 'joanacabreu'),
        opt('quarto-luxo', 'Escuro e sofisticado', 'photo-1644057501622-dfa7dd26dbfb', ['Alto padrão', 'Contemporâneo'], 'Ali Moradi', '3dartistmoradi'),
        opt('quarto-minimalista', 'Painéis de madeira, nada sobrando', 'photo-1760072513376-67a46aab0fd1', ['Minimalista', 'Moderno'], 'Obegi Home', 'obegihome'),
      ],
    },
    {
      id: 'fachada',
      question: 'Qual fachada faria você parar na rua?',
      hint: 'Mesmo que seu projeto seja um apartamento, isso revela seu gosto.',
      options: [
        opt('fachada-contemporaneo', 'Volumes, vidro e jardim', 'photo-1706855203772-c249b75fe016', ['Contemporâneo'], 'Salman Saqib', 'salmansaqib'),
        opt('fachada-brutalista', 'Concreto aparente', 'photo-1625390711106-3728815ebcd9', ['Brutalista', 'Industrial'], 'Ricardo Gomez Angel', 'rgaleriacom'),
        opt('fachada-rustico', 'Pedra e telhado', 'photo-1704750843798-e7655f99a643', ['Rústico', 'Clássico'], 'İrfan Simsar', 'irfansimsar'),
        opt('fachada-moderno', 'Branca e geométrica', 'photo-1680874261352-ed1ee3d1cf01', ['Moderno', 'Minimalista'], 'Lukas Tennie', 'luk10'),
      ],
    },
    {
      id: 'banheiro',
      question: 'E o banheiro dos seus sonhos?',
      hint: 'Materiais de banheiro costumam guiar o resto da casa.',
      options: [
        opt('banheiro-luxo', 'Mármore e pedra escura', 'photo-1667550177753-52b318cd4d40', ['Alto padrão', 'Contemporâneo'], 'Medea Dzagnidze', 'medeadza'),
        opt('banheiro-minimalista', 'Azulejo metrô branco e preto', 'photo-1635247049694-0269c357ab69', ['Minimalista', 'Industrial'], 'Hemant Kanojiya', 'thehk1'),
        opt('banheiro-rustico', 'Ardósia e banheira de cobre', 'photo-1584346651592-3aacc3c99075', ['Rústico'], 'Shawn', 'shawnanggg'),
        opt('banheiro-biofilico', 'Concreto, banheira e plantas', 'photo-1688786219616-598ed96aa19d', ['Biofílico', 'Brutalista'], 'Rebecca Chandler', 'rebecca_luckyducks'),
      ],
    },
  ];
})();
