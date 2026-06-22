import axiosInstance from "./axiosinstance";

let videosCache: any[] | null = null;
let fetchPromise: Promise<any[]> | null = null;

export const getAllVideos = async (
  bypassCache = false
): Promise<any[]> => {
  // Return cached data if available
  if (videosCache && !bypassCache) {
    return videosCache;
  }

  // Return ongoing request if one exists
  if (fetchPromise && !bypassCache) {
    return fetchPromise;
  }

  // Start a new request
  fetchPromise = axiosInstance
    .get<any[]>("/video/getall")
    .then((res) => {
      videosCache = res.data ?? [];
      return videosCache;
    })
    .finally(() => {
      fetchPromise = null;
    });

  return fetchPromise;
};

export const clearVideoCache = (): void => {
  videosCache = null;
  fetchPromise = null;
};