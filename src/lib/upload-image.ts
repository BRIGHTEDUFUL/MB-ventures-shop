import { useConvexMutation } from "@convex-dev/react-query";
import { useCallback } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Convex storage upload: get an upload URL, POST the file, keep the https
 * URL (that is what `image_key` / `gallery` / settings images store).
 */
export function useImageUpload() {
  const generateUploadUrl = useConvexMutation(api.uploads.generateUploadUrl);
  const savePhoto = useConvexMutation(api.uploads.savePhoto);

  return useCallback(
    async (file: File): Promise<string> => {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Photo upload failed.");
      const { storageId } = (await response.json()) as { storageId: string };
      return await savePhoto({ storageId });
    },
    [generateUploadUrl, savePhoto],
  );
}
