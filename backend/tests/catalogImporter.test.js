import test from "node:test";
import assert from "node:assert/strict";
import { parsePrice, parseFeed, productsFromHtml, __test } from "../src/services/catalogImporter.js";
import { assertPublicUrl, __test as fetchTest } from "../src/services/safeFetch.js";

test("parsePrice entende formatos brasileiro e internacional", () => {
  assert.equal(parsePrice("R$ 1.299,90"), 1299.9);
  assert.equal(parsePrice("1299.90 BRL"), 1299.9);
  assert.equal(parsePrice("1,299.90"), 1299.9);
  assert.equal(parsePrice("1.299.000"), 1299000);
  assert.equal(parsePrice(49.5), 49.5);
  assert.equal(parsePrice("grátis"), undefined);
  assert.equal(parsePrice(0), undefined);
});

test("parseFeed lê um feed do Google Shopping", () => {
  const xml = `<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0"><channel>
    <item><g:id>SKU-1</g:id><g:title><![CDATA[Luminária Pendente de Latão]]></g:title>
      <g:link>https://loja.com.br/p/luminaria</g:link><g:image_link>https://loja.com.br/img/1.jpg</g:image_link>
      <g:price>459.90 BRL</g:price><g:product_type>Casa &gt; Iluminação &gt; Pendentes</g:product_type></item>
    <item><g:id>SKU-2</g:id><title>Mesa &amp; Cadeiras</title><link>https://loja.com.br/p/mesa</link></item>
  </channel></rss>`;
  const items = parseFeed(xml, "https://loja.com.br");
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Luminária Pendente de Latão");
  assert.equal(items[0].category, "Pendentes");
  assert.equal(items[1].name, "Mesa & Cadeiras");
});

test("productsFromHtml acha Product em JSON-LD, inclusive dentro de @graph", () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
      {"@type":"Product","name":"Poltrona Escandinava de Carvalho","sku":"P1","image":["https://x.com/a.jpg"],
       "offers":{"@type":"Offer","price":"2490.00","url":"https://x.com/poltrona"}}]}</script>
    <script type="application/ld+json">{ quebrado </script></head></html>`;
  const items = productsFromHtml(html, "https://x.com/poltrona");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "P1");
  assert.equal(items[0].image, "https://x.com/a.jpg");
});

test("finalize infere estilos/materiais e descarta etiquetas internas", () => {
  const p = __test.finalize(
    { id: "1", name: "Mesa Rústica de Madeira de Demolição", url: "/p/mesa", price: "R$ 3.200,00", tags: ["Sala de jantar", "brand::x => y", "OOS"] },
    "https://loja.com.br",
  );
  assert.equal(p.purchaseUrl, "https://loja.com.br/p/mesa");
  assert.equal(p.price, 3200);
  assert.ok(p.styles.includes("Rústico"));
  assert.ok(p.tags.includes("Madeira"));
  assert.ok(p.tags.includes("Sala de jantar"));
  assert.equal(p.category, "Mobiliário");
  assert.ok(!p.tags.some((t) => t.includes("::") || t === "OOS"));
  assert.equal(__test.finalize({ name: "Sem link" }, "https://loja.com.br"), null);
  assert.equal(__test.finalize({ name: "JS", url: "javascript:alert(1)" }, "https://loja.com.br"), null);
});

test("safeFetch bloqueia endereços internos (SSRF)", () => {
  for (const bad of ["http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5", "http://192.168.0.1", "http://169.254.169.254/latest", "http://[::1]/", "ftp://loja.com.br", "https://loja.com.br:8080", "http://intranet"]) {
    assert.throws(() => assertPublicUrl(bad), undefined, bad);
  }
  assert.equal(assertPublicUrl("https://loja.com.br/produtos").hostname, "loja.com.br");
  assert.ok(fetchTest.isPrivateIp("172.20.1.1"));
  assert.ok(fetchTest.isPrivateIp("::ffff:127.0.0.1"));
  assert.ok(!fetchTest.isPrivateIp("8.8.8.8"));
});
