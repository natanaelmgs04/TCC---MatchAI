# Fotos do site

Cópias locais das fotos do [Unsplash](https://unsplash.com) usadas no site, sob a
[Unsplash License](https://unsplash.com/license): uso livre, inclusive comercial, sem
atribuição obrigatória. O nome de cada arquivo é o id da foto no Unsplash
(`photo-<id>.webp` → `https://unsplash.com/photos/<id>`). Os créditos dos fotógrafos do
questionário de estilo continuam na tela, em `assets/js/data/style-questions.js`.

Ficam dentro do projeto para o site não depender do domínio images.unsplash.com,
bloqueado em algumas redes (laboratórios, empresas). `fallback.webp` é a imagem neutra
usada quando uma foto externa (vinda do banco) não carrega.

Para trazer uma foto nova do Unsplash: cole o link normal no HTML/JS/CSS e rode, na raiz,
`python assets/img/dev/localize_photos.py` (precisa do Pillow).
