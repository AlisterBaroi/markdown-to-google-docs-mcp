import { getAccessToken } from './auth';

export const uploadHtmlToGoogleDocs = async (
  htmlContent: string,
  fileName: string,
  folderId?: string
): Promise<{ id: string, url: string }> => {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const metadata = {
    name: fileName,
    mimeType: "application/vnd.google-apps.document", // Automatically converts to a Google Doc
    parents: folderId ? [folderId] : []
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([htmlContent], { type: 'text/html' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Upload error:", errText);
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  
  // To get the WebViewLink we need to fetch the file again, or just construct it:
  return {
    id: data.id,
    url: `https://docs.google.com/document/d/${data.id}/edit`
  };
};

export const fetchFolderName = async (folderId: string): Promise<string> => {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch folder: ${res.statusText}`);
  }
  
  const data = await res.json();
  return data.name;
};
