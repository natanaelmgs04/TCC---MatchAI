import * as rateLimitLib from "express-rate-limit";

/**
 * Chave dos limites de uso por hora: o usuário logado quando houver, senão o IP.
 *
 * A partir da v8, o express-rate-limit recusa (ERR_ERL_KEY_GEN_IPV6) qualquer
 * keyGenerator que use req.ip sem passar pelo helper ipKeyGenerator — sem ele,
 * um usuário IPv6 trocaria de endereço dentro da própria faixa e escaparia do
 * limite. A v7 (a do package-lock) não tem o helper, então usamos o da
 * biblioteca quando existe e o IP puro quando não existe. O nome da função
 * precisa aparecer no código do keyGenerator: é assim que a v8 confere.
 */
const ipKeyGenerator = rateLimitLib.ipKeyGenerator ?? ((ip) => ip);

export const userOrIpKey = (req) => req.user?.id || ipKeyGenerator(req.ip);
