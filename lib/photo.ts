// 팬 라운지 사진 올리기(브라우저 전용): 줄여서 /api/community/upload로 보낸다
/** 휴대폰 사진을 긴 변 1280px JPEG로 줄인다(부모님 휴대폰 원본 10MB도 1MB 안쪽으로) */
export async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
}
/** 사진 한 장 올리고 주소를 돌려준다 */
export async function uploadPhoto(f: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([await shrink(f)], "photo.jpg", { type: "image/jpeg" }));
  const r = await fetch("/api/community/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "사진을 올리지 못했어요");
  return j.url as string;
}
