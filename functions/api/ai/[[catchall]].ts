import worker from '../../../src/worker';

export const onRequest = async (context: {
  request: Request;
  env: Record<string, any>;
  params: Record<string, any>;
  waitUntil: (promise: Promise<any>) => void;
  next: () => Promise<Response>;
  data: Record<string, any>;
}): Promise<Response> => {
  return worker.fetch(context.request, context.env);
};
