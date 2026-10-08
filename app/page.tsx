import WorkspaceApp from '@/components/workspace';
import {requireChatGPTUser} from './chatgpt-auth';
export default async function Page(){await requireChatGPTUser('/');return <WorkspaceApp/>}
