import { Prisma, prisma } from '@flowmoney/database';
import { AuditAction, WHATSAPP_LIMITS } from '@flowmoney/shared-types';
import { env } from '../config/env';
import { recordAudit } from '../lib/audit';
import { runConversationTurn } from './ai.service';
import { loadUserAccess } from '../modules/auth/rbac';
import { confirmPaymentIntent, pendingIntentFor } from './payment.service';
import { synthesizeSpeech, transcribeAudio } from './speech.service';
import { whatsappProvider, type InboundMessage } from './whatsapp';

export interface InboundResult {
  status: 'PROCESSED' | 'IGNORED' | 'FAILED' | 'DUPLICATE';
  reply?: string;
  userId?: string;
  detail?: string;
}

const UNKNOWN_NUMBER_REPLY =
  "I don't recognise this number yet. Sign in at the FlowMoney AI dashboard and add this WhatsApp number to your profile, and I'll be able to help with your finances here.";

const NOT_OPTED_IN_REPLY =
  'Your account exists, but WhatsApp is not enabled on it yet. Turn on WhatsApp in Settings on the dashboard and message me again.';

/**
 * Handles one inbound WhatsApp message end to end.
 *
 * Identification is by phone number only — this channel never accepts a user id
 * from the payload, because a webhook body is attacker-controllable.
 */
export async function handleInboundMessage(message: InboundMessage): Promise<InboundResult> {
  const provider = whatsappProvider();

  // Idempotency: WhatsApp retries aggressively, and re-running a turn would
  // duplicate purchase decisions and audit rows.
  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: provider.key, externalId: message.externalId } },
  });
  if (existing && existing.status === 'PROCESSED') {
    return { status: 'DUPLICATE', detail: 'Message already processed' };
  }

  const event = await prisma.webhookEvent.upsert({
    where: { provider_externalId: { provider: provider.key, externalId: message.externalId } },
    create: {
      provider: provider.key,
      eventType: `message.${message.type}`,
      externalId: message.externalId,
      status: 'PROCESSING',
      signatureValid: true,
      payload: message.raw as Prisma.InputJsonValue,
      attempts: 1,
    },
    update: { status: 'PROCESSING', attempts: { increment: 1 } },
  });

  const fail = async (detail: string): Promise<InboundResult> => {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'FAILED', error: detail, processedAt: new Date() },
    });
    return { status: 'FAILED', detail };
  };

  try {
    const user = await prisma.user.findUnique({
      where: { phone: message.from },
      include: { profile: true },
    });

    if (!user) {
      await provider.sendText(message.from, UNKNOWN_NUMBER_REPLY);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'IGNORED', error: 'Unknown phone number', processedAt: new Date() },
      });
      return { status: 'IGNORED', detail: 'Unknown phone number', reply: UNKNOWN_NUMBER_REPLY };
    }

    if (!user.profile?.whatsappOptIn) {
      await provider.sendText(message.from, NOT_OPTED_IN_REPLY);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'IGNORED', error: 'WhatsApp not enabled', processedAt: new Date() },
      });
      return { status: 'IGNORED', detail: 'WhatsApp not enabled', reply: NOT_OPTED_IN_REPLY };
    }

    const access = await loadUserAccess(user.id);
    if (!access || access.status !== 'ACTIVE') {
      return fail('Account is not active');
    }

    // ------------------------------------------------------ voice handling
    let text = message.text?.trim() ?? '';
    let voiceInteractionId: string | null = null;

    if (message.type === 'audio' && message.mediaId) {
      const interaction = await prisma.voiceInteraction.create({
        data: {
          userId: user.id,
          kind: 'VOICE_NOTE',
          status: 'TRANSCRIBING',
          channel: 'WHATSAPP',
          externalMediaId: message.mediaId,
        },
        select: { id: true },
      });
      voiceInteractionId = interaction.id;

      const media = await provider.downloadMedia(message.mediaId);
      const transcription = await transcribeAudio(media.buffer, media.mimeType ?? 'audio/ogg');

      if (!transcription.ok || !transcription.text) {
        const reason =
          transcription.reason ?? 'I could not understand that voice note. Could you send it as text?';
        await prisma.voiceInteraction.update({
          where: { id: interaction.id },
          data: { status: 'FAILED', error: reason },
        });
        await provider.sendText(
          message.from,
          `I couldn't transcribe that voice note. ${reason} You can also just type your question.`,
        );
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        return { status: 'PROCESSED', userId: user.id, detail: reason };
      }

      text = transcription.text;
      await prisma.voiceInteraction.update({
        where: { id: interaction.id },
        data: { status: 'PROCESSING', transcript: text },
      });
    }

    if (!text) {
      await provider.sendText(
        message.from,
        'I can only read text and voice notes right now. Send me a question like "can I afford a ₹20,000 trip?"',
      );
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { status: 'PROCESSED', userId: user.id, detail: 'Unsupported message type' };
    }

    // ------------------------------------------- payment confirmation path
    // Checked before the orchestrator: authorising money is never routed
    // through a language model.
    const pending = await pendingIntentFor(user.id);
    if (pending && text.toUpperCase().includes(pending.confirmationPhrase.toUpperCase())) {
      const result = await confirmPaymentIntent(
        user.id,
        pending.id,
        pending.confirmationPhrase,
        'WHATSAPP',
      );
      const reply =
        result.status === 'SUCCEEDED'
          ? `✅ Paid ₹${Number(pending.amount).toLocaleString('en-IN')} to ${pending.merchant}. Your balance and budget have been updated.`
          : `🛑 Payment failed: ${result.failureReason}`;
      await provider.sendText(message.from, reply);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return { status: 'PROCESSED', userId: user.id, reply };
    }

    // ------------------------------------------------------- agent turn
    const turn = await runConversationTurn({
      userId: user.id,
      fullName: user.fullName,
      permissions: access.permissions,
      message: text,
      channel: 'WHATSAPP',
      externalRef: message.from,
      currency: user.profile?.currency ?? 'INR',
    });

    const body = turn.text.slice(0, WHATSAPP_LIMITS.maxBodyLength);
    if (turn.quickActions.length > 0) {
      await provider.sendButtons(
        message.from,
        body,
        turn.quickActions.slice(0, WHATSAPP_LIMITS.maxButtons).map((action, index) => ({
          id: `qa_${index}_${action.command.slice(0, 20)}`,
          title: action.label,
        })),
      );
    } else {
      await provider.sendText(message.from, body);
    }

    // A voice note gets a voice reply back, when enabled.
    if (message.type === 'audio' && env.VOICE_REPLY_ENABLED && user.profile?.voiceRepliesEnabled) {
      const speech = await synthesizeSpeech(turn.text);
      if (speech.ok && speech.audio) {
        await provider.sendAudio(message.from, speech.audio, speech.mimeType);
      }
      if (voiceInteractionId) {
        await prisma.voiceInteraction.update({
          where: { id: voiceInteractionId },
          data: {
            status: 'COMPLETED',
            responseText: turn.text,
            conversationId: turn.conversationId,
          },
        });
      }
    } else if (voiceInteractionId) {
      await prisma.voiceInteraction.update({
        where: { id: voiceInteractionId },
        data: { status: 'COMPLETED', responseText: turn.text, conversationId: turn.conversationId },
      });
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });

    await recordAudit({
      userId: user.id,
      action: AuditAction.WEBHOOK_RECEIVED,
      resource: 'whatsapp_message',
      resourceId: message.externalId,
      channel: 'WHATSAPP',
      metadata: {
        intent: turn.intent,
        agentKey: turn.agentKey,
        messageType: message.type,
        conversationId: turn.conversationId,
      },
    });

    return { status: 'PROCESSED', userId: user.id, reply: turn.text };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // The user still gets a reply — silence on a financial assistant is worse
    // than an apology.
    await provider
      .sendText(
        message.from,
        'Something went wrong on my side. Please try again in a moment.',
      )
      .catch(() => undefined);
    return fail(detail);
  }
}
