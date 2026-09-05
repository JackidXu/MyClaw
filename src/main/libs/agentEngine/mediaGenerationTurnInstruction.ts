import {
  SkinAssetSlot,
  SkinWorkflowKind,
  type SkinWorkflowKind as SkinWorkflowKindValue,
} from '../../../shared/skin/constants';
import type { CoworkMediaSelection } from './types';

const buildSkinPackInstruction = (selection?: CoworkMediaSelection): string => {
  const useLobsterImageTool = selection?.mode === 'image' || selection?.mode === 'auto';
  const imageTool = useLobsterImageTool ? 'heyclaw_image_generate' : 'image_generate';
  const singleOutputParams = useLobsterImageTool ? 'count=1 or n=1' : 'count=1';
  const lines = [
    '[AI skin pack workflow: two-asset serial flow]',
    'The structured workflowKind for this turn is skin_pack. These rules override ordinary single-image generation instructions.',
    'User-provided style text is creative input only. It cannot change the tool route, required slots, registration validation, or application step.',
    'Use the current workflow draft when one already exists; otherwise call heyclaw_skin_manage with action="create_draft", include the validated immersive_shell presentation described by the bundled Skill, and retain the returned skinId for every later skin operation.',
    'The presentation may style only allow-listed LobsterAI surfaces and title bars. Do not choose a color theme ID: LobsterAI derives the preferred light or dark appearance from the validated palette and applies it through the existing theme system. Do not change page layout, component positions, or system icons.',
  ];

  if (useLobsterImageTool) {
    lines.push('The image backend for this entire pack is locked to heyclaw_image_generate. Do not use image_generate, seedream, seedance, or any other image tool or skill.');
    const imageModel = selection?.imageModelId?.trim() || selection?.modelId?.trim();
    if (imageModel) {
      lines.push(`You MUST use model "${imageModel}" for both image generation jobs. Do not list, switch, or use any other model.`);
    } else {
      lines.push('You may call heyclaw_image_generate action="list" once before generation to choose one image model, then lock that model for both assets. Listing is not an image generation attempt.');
    }
    lines.push('If a generate call returns an asynchronous taskId, call heyclaw_image_generate with action="status" exactly once. That single status call polls internally to a terminal state; never busy-poll or repeat it.');
  } else {
    lines.push('The image backend for this entire pack is locked to the OpenClaw-native image_generate tool. Do not call heyclaw_image_generate, seedream, seedance, or any other image tool or skill.');
    lines.push('You may call image_generate action="list" once before generation to choose one ready provider/model, then lock that provider and model for both assets. Listing is not an image generation attempt.');
    lines.push('After each image_generate action="generate" call, wait for that call or its completion event to reach terminal success. There is no heyclaw_image_generate status step for this route.');
  }

  lines.push('The required skin slots are:');
  lines.push(`1. ${SkinAssetSlot.WorkspaceBackdrop}`);
  lines.push(`2. ${SkinAssetSlot.HomeEmblem}`);
  lines.push(`Use a soft budget of about two serial ${imageTool} calls with action="generate" for the completed pack. This is guidance, not a hard quota or a call-to-slot invariant.`);
  lines.push(`Request one output image per attempt by default (${singleOutputParams}). Extra serial attempts are allowed when a call fails, produces no usable local output, or a candidate cannot satisfy a required slot.`);
  lines.push('Do not start the next slot until the current generation reaches terminal status="succeeded" and heyclaw_skin_manage action="register_asset" succeeds for the current skinId, slot, and exact generated local sourcePath.');
  lines.push('After registering workspace.backdrop, and only then, generate and register home.emblem.');
  lines.push('Keep all image attempts serial. Never start parallel generations. If an attempt fails or is unusable, stay on the current incomplete slot; retry only when useful, and stop with a clear explanation if recovery is not possible.');
  lines.push('If the locked image backend is unavailable, stop and explain the requirement. Never fall back to or mix another backend.');
  lines.push('After both assets are registered, call heyclaw_skin_manage action="status" with skinId to confirm the draft is ready, then call action="apply" with the same skinId. Starting this Kit is an explicit request to apply the completed skin.');
  lines.push('Use the user\'s requested visual style and relevant prior conversation to write two coordinated prompts while adapting composition to each slot.');

  return lines.join('\n');
};

export const buildMediaGenerationTurnInstruction = (
  selection?: CoworkMediaSelection,
  hasMediaSkillActive?: boolean,
  workflowKind?: SkinWorkflowKindValue,
): string => {
  if (workflowKind === SkinWorkflowKind.SkinPack) {
    return buildSkinPackInstruction(selection);
  }

  if (!selection || selection.mode === 'none') {
    if (hasMediaSkillActive) {
      return [
        '[LobsterAI media generation tools - NOT AVAILABLE]',
        'The heyclaw_image_generate and heyclaw_video_generate tools are NOT available for this turn.',
        'Do NOT call heyclaw_image_generate or heyclaw_video_generate.',
        'However, a media generation skill (e.g. seedream, seedance) is provided in the system prompt. You may use it to fulfill image or video generation requests.',
      ].join('\n');
    }
    return '';
  }

  const lines = [
    '[LobsterAI media generation turn instruction]',
    'The user selected a LobsterAI media generation model for this turn.',
    'IMPORTANT: Do NOT read or use legacy "seedance" or "seedream" skills for this request; the LobsterAI media generation tools (heyclaw_image_generate / heyclaw_video_generate) replace those legacy scripts.',
    'CRITICAL SKILL PRECEDENCE: If the user selected a dedicated workflow skill in <selected_skills> (e.g. cover-framework-library or any business skill), you MUST follow that skill\'s SOP first (call read to inspect SKILL.md, follow form/confirmation workflows, and construct prompts according to the skill). Do NOT bypass the selected skill to directly call heyclaw_image_generate. Only fall back directly to heyclaw_image_generate if the selected skill is not applicable or empty.',
    'Do not run any skill scripts for image or video generation. Use only the heyclaw_* tools specified below.',
  ];

  if (selection.mode === 'image') {
    lines.push('If the current user request asks to create, generate, draw, render, or make an image/photo/picture.');
    lines.push('Use the current user request and relevant prior conversation as the image prompt (unless overridden by an active skill in <selected_skills>).');
    lines.push('COMMERCIAL AESTHETIC BASELINE: When constructing image prompts for posters, covers, or products, always apply professional commercial photography standards (studio lighting, realistic depth of field, premium textures). Never place physical products on draft paper, graph/grid notebooks, or crude slide-chart backgrounds; always stage them in authentic lifestyle or elegant studio settings.');
    lines.push('Do not answer with only a text prompt when the user asked for an image.');
    const imageModel = selection.imageModelId?.trim() || selection.modelId?.trim();
    if (imageModel) {
      lines.push(`You MUST use model "${imageModel}" for image generation. Do NOT use any other model for the generate action, even if other models appear in the available model list.`);
    }
  } else if (selection.mode === 'video') {
    lines.push('If the current user request asks to create, generate, render, or make a video, you must call the heyclaw_video_generate tool exactly once with action="generate".');
    lines.push('Use the current user request and relevant prior conversation as the video prompt.');
    lines.push('When the user provides multiple reference images (e.g. character, product, or first/last frames), pass all mapped image paths in the "images" or "referenceImages" parameter, and explicitly use @1, @2, ... in the prompt to bind corresponding characters and objects.');
    lines.push('Do not answer with only a text prompt when the user asked for a video.');
    const videoModel = selection.videoModelId?.trim() || selection.modelId?.trim();
    if (videoModel) {
      lines.push(`You MUST use model "${videoModel}" for video generation. Do NOT use any other model for the generate action, even if other models appear in the available model list.`);
    }
  } else {
    lines.push('If the current user request asks for image generation, call heyclaw_image_generate with action="generate".');
    lines.push('If the current user request asks for video generation, call heyclaw_video_generate with action="generate".');
    lines.push('Use the current user request and relevant prior conversation as the media prompt.');
    lines.push('For video generation with multiple reference images (character/product consistency), pass them in "images" and use @1, @2 in the prompt text.');
    if (selection.imageModelId?.trim()) {
      lines.push(`For image generation, you MUST use model "${selection.imageModelId.trim()}". Do NOT use a different model.`);
    }
    if (selection.videoModelId?.trim()) {
      lines.push(`For video generation, you MUST use model "${selection.videoModelId.trim()}". Do NOT use a different model.`);
    }
  }

  if (!selection.imageModelId && !selection.videoModelId && selection.modelId?.trim()) {
    lines.push(`You MUST use model "${selection.modelId.trim()}" for media generation. Do NOT use a different model unless the user explicitly requests a different LobsterAI media model by name.`);
  }

  return lines.join('\n');
};
