import { EventEmitter } from "events";
import logger from "../configs/logger";

export class EventBus {
    private emitter: EventEmitter;

    constructor() {
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(100);
    }

    // Đăng ký emitter
    on(event: string, listener: (...args: any[]) => void): void {
        logger.info(`Đăng ký listener cho sự kiện: ${event}`);
        this.emitter.on(event, listener);
    }

    // Phát even đồng bộ
    emit(event: string, ...args: any[]): void {
        logger.info(`Phát sự kiện: ${event}`);
        this.emitter.emit(event, ...args);
    }

    // Phát event bất đồng bộ
    async emitAsync(event: string, ...args: any[]): Promise<void> {
        const listeners = this.emitter.listeners(event);
        if (listeners.length === 0) {
            logger.info(`Không có listener nào cho sự kiện: ${event}`);
            return;
        }

        logger.info(`Phát sự kiện bất đồng bộ: ${event} tới ${listeners.length} listener`, {
            payload: args[0],
        });

        await Promise.all(
            listeners.map(async (listener, i) => {
                const listenerName = listener.name || `Listener#${i + 1}`;
                const start = Date.now();
                try {
                    await Promise.resolve(listener(...args));
                    const duration = Date.now() - start;
                    logger.info(`[EventBus] ✅ ${listenerName} đã xử lý "${event}" - ${duration}ms`);
                } catch (err) {
                    logger.error(`[EventBus] ❌ ${listenerName} đã thất bại cho "${event}"`, { error: err });
                }
            })
        );

        logger.info(`Hoàn tất phát sự kiện bất đồng bộ: ${event}`);
    }
}