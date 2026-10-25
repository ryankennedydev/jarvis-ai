export const NEON = "#c4ff3d";

export const newId = (prefixo: string) =>
  `${prefixo}-${(typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2)).slice(0, 8)}`;

export const sectorColor = (cor: string | undefined) => (cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : NEON);

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const initials = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

export const formatDate = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/** Reduz a foto enviada para no máximo 256px antes de guardar em base64. */
export function imageFileToDataUrl(arquivo: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith("image/")) return reject(new Error("Arquivo não é uma imagem."));
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida.")); };
    img.src = url;
  });
}

/** Só aceita fotos https ou base64 de imagem (nada de javascript: etc.). */
export const safePhoto = (foto: string) =>
  /^https:\/\//i.test(foto) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(foto) ? foto : "";
