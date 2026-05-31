export function compressAndConvertToBase64(file, maxWidth = 400, maxHeight = 400, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadBase64ToSupabase(base64, supabase) {
  if (!base64) return null;
  const res = await fetch(base64);
  const blob = await res.blob();
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;

  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}
