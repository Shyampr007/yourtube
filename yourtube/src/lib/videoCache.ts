import axiosInstance from "./axiosinstance";

let videosCache: any[] | null = null;
let fetchPromise: Promise<any[]> | null = null;

export const getAllVideos = async (bypassCache = false): Promise<any[]> => {
  if (videosCache && !bypassCache) {
    return videosCache;
  }
  if (fetchPromise && !bypassCache) {
    return fetchPromise;
  }

  fetchPromise = axiosInstance.get("/video/getall")
    .then((res) => {
      videosCache = res.data ?? [];
      fetchPromise = null;
      return videosCache;
    })
    .catch((err) => {
      fetchPromise = null;
      throw err;
    });

  return fetchPromise;
};

export const clearVideoCache = () => {
  videosCache = null;
  fetchPromise = null;
};
