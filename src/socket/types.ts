import { Socket } from "socket.io";

export interface SocketWithUser extends Socket {
  user?: { id: string; fullname: string };
}
