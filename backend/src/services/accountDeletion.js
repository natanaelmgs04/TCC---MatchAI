import Project from "../models/Project.js";
import Message from "../models/Message.js";
import Review from "../models/Review.js";
import MatchHistory from "../models/MatchHistory.js";
import Validation from "../models/Validation.js";
import Favorite from "../models/Favorite.js";
import Timeline from "../models/Timeline.js";
import CaseStudy from "../models/CaseStudy.js";
import ProfileView from "../models/ProfileView.js";
import StoreProduct from "../models/StoreProduct.js";
import StoreReferral from "../models/StoreReferral.js";
import Notification from "../models/Notification.js";
import Hire from "../models/Hire.js";
import AssistantChat from "../models/AssistantChat.js";
import ArchitectAssistantChat from "../models/ArchitectAssistantChat.js";
import User from "../models/User.js";
import Model3D from "../models/Model3D.js";
import { deleteModel } from "./model3dStore.js";
import ProjectFile from "../models/ProjectFile.js";
import { deleteFilesOfProjects, deleteProjectFile } from "./projectFileStore.js";

/**
 * Apaga a conta e tudo que referencia esse usuário nas outras coleções
 * (LGPD, art. 18, VI). Usado pela própria pessoa (DELETE /api/dashboard/me)
 * e pela equipe no painel de gestão.
 */
export async function deleteUserCascade(userId) {
  // Estúdio 3D: modelos (e arquivos) do arquiteto; nos de outros, sai da lista e dos comentários.
  for (const m of await Model3D.find({ owner: userId }).select("_id file preview")) await deleteModel(m);
  await Model3D.updateMany({ $or: [{ sharedWith: userId }, { "comments.author": userId }] }, { $pull: { sharedWith: userId, comments: { author: userId } } });
  // Espaço do projeto: arquivos dos projetos do cliente e os que a pessoa enviou em projetos de outros.
  await deleteFilesOfProjects((await Project.find({ client: userId }).select("_id")).map((p) => p._id));
  for (const f of await ProjectFile.find({ uploader: userId }).select("_id file")) await deleteProjectFile(f);
  await Promise.all([
    Project.deleteMany({ client: userId }),
    Message.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
    Review.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    MatchHistory.deleteMany({ client: userId }),
    Validation.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    Favorite.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    Timeline.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    CaseStudy.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    ProfileView.deleteMany({ architect: userId }),
    StoreProduct.deleteMany({ store: userId }),
    StoreReferral.deleteMany({ $or: [{ store: userId }, { client: userId }] }),
    Notification.deleteMany({ user: userId }),
    Hire.deleteMany({ $or: [{ client: userId }, { architect: userId }] }),
    AssistantChat.deleteMany({ client: userId }),
    ArchitectAssistantChat.deleteMany({ architect: userId }),
  ]);
  await User.deleteOne({ _id: userId });
}
