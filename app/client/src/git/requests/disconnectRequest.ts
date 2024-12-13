import type { AxiosPromise } from "axios";
import { GIT_BASE_URL } from "./constants";
import type { DisconnectResponse } from "./disconnectRequest.types";
import Api from "api/Api";

export default async function disconnectRequest(
  baseApplicationId: string,
): AxiosPromise<DisconnectResponse> {
  return Api.post(`${GIT_BASE_URL}/disconnect/app/${baseApplicationId}`);
}