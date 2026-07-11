import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'moonbot-tutor-backend',
      time: new Date().toISOString(),
    };
  }
}
