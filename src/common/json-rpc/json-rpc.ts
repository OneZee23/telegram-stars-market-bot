import { JsonRpcError } from './json-rpc.error';

/**
 * # Helper-tools for JsonRPC API organization
 */
export namespace JsonRpc {
  export interface SuccessfulResponse<T> {
    readonly status: 'ok';
    readonly payload: T;
  }

  export interface FailedResponse {
    readonly status: 'error';
    readonly message: string;
    readonly code: string;
    readonly payload?: unknown;
  }

  export interface FailedResponseDetailed {
    readonly status: 'error';
    readonly code: string;
    readonly message: '';
  }

  export type Response<T> =
    | SuccessfulResponse<T>
    | FailedResponse
    | FailedResponseDetailed;

  /**
   * # Unwrap payload (or error) from JsonRPC response
   */
  export function unwrap<T>(response: Response<T>): object | T {
    if (response.status === 'error') {
      throw new JsonRpcError(response.code, response.message);
    }

    return response.payload;
  }
}
