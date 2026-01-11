
import { SpeechService } from "$lib/services/speech-service";
import type { RequestHandler } from './$types';


export async function POST({ request }): Promise<any> {
  const { audio } = await request.json();
  const transcript = await SpeechService.transcribe(audio);
  return json({ transcript });
}
