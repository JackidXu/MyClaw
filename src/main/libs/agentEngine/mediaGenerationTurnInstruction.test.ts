import { describe, expect, test } from 'vitest';

import { MediaPreferenceMode, MediaSelectionSource } from '../../../shared/media/defaultPolicy';
import { SkinAssetSlot, SkinWorkflowKind } from '../../../shared/skin/constants';
import {
  buildMediaGenerationTurnInstruction,
  MANAGED_MEDIA_GENERATION_POLICY_PROMPT,
} from './mediaGenerationTurnInstruction';

describe('buildMediaGenerationTurnInstruction', () => {
  test('keeps an ordinary image request instruction prompt without hard single-turn quota', () => {
    const instruction = buildMediaGenerationTurnInstruction({
      mode: 'image',
      imageModelId: 'image-model',
    });

    expect(instruction).toContain('If the current user request asks to create, generate, draw, render, or make an image/photo/picture.');
    expect(instruction).not.toContain('[AI skin pack workflow: strict two-asset transaction]');
    expect(instruction).not.toContain('heyclaw_skin_manage');
  });

  test('guides a two-slot serial skin flow without a hard generation quota', () => {
    const instruction = buildMediaGenerationTurnInstruction(
      { mode: 'image', imageModelId: 'image-model' },
      false,
      SkinWorkflowKind.SkinPack,
    );

    const backdropIndex = instruction.indexOf(`1. ${SkinAssetSlot.WorkspaceBackdrop}`);
    const emblemIndex = instruction.indexOf(`2. ${SkinAssetSlot.HomeEmblem}`);

    expect(backdropIndex).toBeGreaterThan(-1);
    expect(emblemIndex).toBeGreaterThan(backdropIndex);
    expect(instruction).toContain('soft budget of about two serial heyclaw_image_generate calls');
    expect(instruction).toContain('guidance, not a hard quota');
    expect(instruction).toContain('Extra serial attempts are allowed');
    expect(instruction).toContain('action="status" exactly once');
    expect(instruction).toContain('action="register_asset" succeeds');
    expect(instruction).toContain('action="apply" with the same skinId');
    expect(instruction).toContain('Never start parallel generations');
  });

  test('uses the native image route for a skin workflow without HeyClaw image selection', () => {
    const instruction = buildMediaGenerationTurnInstruction(
      undefined,
      false,
      SkinWorkflowKind.SkinPack,
    );

    expect(instruction).toContain('[AI skin pack workflow: two-asset serial flow]');
    expect(instruction).toContain('locked to the OpenClaw-native image_generate tool');
    expect(instruction).toContain('soft budget of about two serial image_generate calls');
    expect(instruction).toContain('(count=1)');
    expect(instruction).toContain('There is no heyclaw_image_generate status step');
    expect(instruction).toContain('heyclaw_skin_manage');
    expect(instruction).not.toContain('LobsterAI media generation tools - NOT AVAILABLE');
  });

  test('uses the HeyClaw image route for auto media selection', () => {
    const instruction = buildMediaGenerationTurnInstruction(
      { mode: 'auto', imageModelId: 'image-model' },
      false,
      SkinWorkflowKind.SkinPack,
    );

    expect(instruction).toContain('locked to heyclaw_image_generate');
    expect(instruction).toContain('model "image-model" for both image generation jobs');
    expect(instruction).not.toContain('OpenClaw-native image_generate tool');
  });

  test('preserves the media-skill fallback when LobsterAI tools are unavailable', () => {
    const instruction = buildMediaGenerationTurnInstruction(undefined, true);

    expect(instruction).toContain('LobsterAI media generation tools - NOT AVAILABLE');
    expect(instruction).toContain('You may use it');
  });
});


test('system defaults do not claim user authorization and point at the cached policy', () => {
  const instruction = buildMediaGenerationTurnInstruction({
    mode: 'auto', imageModelId: 'image', videoModelId: 'video',
    imageSource: MediaSelectionSource.Default, videoSource: MediaSelectionSource.Default,
  });
  expect(instruction).toContain('NOT user authorization');
  expect(instruction).toContain('"Media Generation Policy" in AGENTS.md');
  expect(instruction).toContain('heyclaw_image_generate with model "image"');
  expect(instruction).toContain('heyclaw_video_generate with model "video"');
  expect(instruction).not.toContain('The user selected');
  // The static rules travel in the cached AGENTS.md section, not this per-session message.
  expect(instruction).not.toContain('mind maps');
  expect(instruction.length).toBeLessThan(700);
});

test('the managed media policy keeps the charts, editing and confirmation rules', () => {
  expect(MANAGED_MEDIA_GENERATION_POLICY_PROMPT).toContain('## Media Generation Policy');
  expect(MANAGED_MEDIA_GENERATION_POLICY_PROMPT).toContain('NOT user authorization');
  expect(MANAGED_MEDIA_GENERATION_POLICY_PROMPT).toContain('mind maps');
  expect(MANAGED_MEDIA_GENERATION_POLICY_PROMPT).toContain('editing existing footage');
  expect(MANAGED_MEDIA_GENERATION_POLICY_PROMPT).toContain('explicit user confirmation');
});

test('a skin workflow cannot bypass a persistent image off preference', () => {
  const instruction = buildMediaGenerationTurnInstruction(
    { mode: 'none', imagePreference: MediaPreferenceMode.Off, preferencesRevision: 1 }, false, SkinWorkflowKind.SkinPack,
  );
  expect(instruction).toContain('disabled by the user');
  expect(instruction).not.toContain('locked to the OpenClaw-native');
});
