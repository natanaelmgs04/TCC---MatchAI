/**
 * Regras da contratação, sem banco — o controller consulta o estado e pergunta
 * aqui se a ação pode acontecer. Devolve null quando pode, ou { status, error }
 * com a mensagem para o usuário.
 */

/** Cliente pedindo para contratar um arquiteto para um projeto. */
export function canRequestHire({ project, architect, openHire, acceptedHire, clientId }) {
  if (!project || String(project.client) !== String(clientId)) return { status: 404, error: "Projeto não encontrado" };
  if (!architect || architect.role !== "architect") return { status: 404, error: "Arquiteto não encontrado" };
  if (acceptedHire || project.architect) return { status: 409, error: "Este projeto já foi contratado." };
  if (openHire) {
    return String(openHire.architect) === String(architect._id ?? architect.id)
      ? { status: 409, error: "Você já enviou um pedido para este arquiteto. Aguarde a resposta." }
      : { status: 409, error: "Este projeto já tem um pedido de contratação aguardando resposta. Cancele-o para contratar outro arquiteto." };
  }
  return null;
}

/** Arquiteto aceitando/recusando, ou cliente cancelando, um pedido. */
export function canDecideHire(hire, { action, userId, role }) {
  if (!hire) return { status: 404, error: "Pedido não encontrado" };
  const owner = action === "cancel" ? hire.client : hire.architect;
  const expectedRole = action === "cancel" ? "client" : "architect";
  if (role !== expectedRole || String(owner) !== String(userId)) return { status: 404, error: "Pedido não encontrado" };
  if (hire.status !== "pending") {
    const label = { accepted: "já foi aceito", declined: "já foi recusado", cancelled: "foi cancelado" }[hire.status] || "já foi respondido";
    return { status: 409, error: `Este pedido ${label}.` };
  }
  return null;
}

/** Texto público de um projeto fechado, sem o nome que o cliente deu (pode ter dado pessoal). */
export function publicProjectTitle(project) {
  const kind = project?.propertyType ? String(project.propertyType) : "Projeto";
  const style = project?.preferredStyles?.[0];
  return style ? `${kind} · ${style}` : kind;
}
