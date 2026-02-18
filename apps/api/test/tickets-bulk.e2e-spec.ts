import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { signAccessToken } from '../src/auth/token.util';
import { TicketsController } from '../src/tickets/tickets.controller';
import { TicketsService } from '../src/tickets/tickets.service';

describe('TicketsController bulk status (e2e)', () => {
  let app: INestApplication;

  const ticketsServiceMock = {
    list: jest.fn(),
    create: jest.fn(),
    bulkUpdateStatus: jest.fn(),
    updateStatus: jest.fn(),
    updateAssignee: jest.fn(),
    remove: jest.fn(),
    listSubmissions: jest.fn(),
    createSubmission: jest.fn(),
    getSubmissionFile: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: ticketsServiceMock }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH /tickets/bulk/status updates selected tickets for captain', async () => {
    const token = signAccessToken({ sub: 'captain-id', role: 'CAPTAIN' }, 300);
    ticketsServiceMock.bulkUpdateStatus.mockResolvedValue({
      ok: true,
      status: 'IN_REVIEW',
      updatedCount: 2,
      ticketIds: ['t1', 't2'],
    });

    const res = await request(app.getHttpServer())
      .patch('/tickets/bulk/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketIds: ['t1', 't2'], status: 'IN_REVIEW' })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.updatedCount).toBe(2);
    expect(ticketsServiceMock.bulkUpdateStatus).toHaveBeenCalledWith('captain-id', {
      ticketIds: ['t1', 't2'],
      status: 'IN_REVIEW',
    });
  });

  it('PATCH /tickets/bulk/status returns partial payload', async () => {
    const token = signAccessToken({ sub: 'captain-id', role: 'CAPTAIN' }, 300);
    ticketsServiceMock.bulkUpdateStatus.mockResolvedValue({
      ok: true,
      status: 'DONE',
      updatedCount: 1,
      ticketIds: ['t1'],
      failedIds: ['missing-id'],
      partial: true,
    });

    const res = await request(app.getHttpServer())
      .patch('/tickets/bulk/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ticketIds: ['t1', 'missing-id'], status: 'DONE' })
      .expect(200);

    expect(res.body.partial).toBe(true);
    expect(res.body.failedIds).toEqual(['missing-id']);
  });

  it('PATCH /tickets/bulk/status returns 400 without authorization', async () => {
    await request(app.getHttpServer())
      .patch('/tickets/bulk/status')
      .send({ ticketIds: ['t1'], status: 'DONE' })
      .expect(400);
  });
});
