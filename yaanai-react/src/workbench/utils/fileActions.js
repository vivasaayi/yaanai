import { convertFileSrc, invoke } from '@tauri-apps/api/core';

const IMAGE_EXTENSIONS = new Set([
    'apng',
    'avif',
    'bmp',
    'gif',
    'heic',
    'heif',
    'ico',
    'jpeg',
    'jpg',
    'png',
    'svg',
    'tif',
    'tiff',
    'webp',
]);

export async function revealInFinder(path) {
    if (!path) return;
    await invoke('reveal_in_file_manager', { path });
}

export async function openSystemTrash() {
    await invoke('open_system_trash');
}

export async function openFullDiskAccessSettings() {
    await invoke('open_full_disk_access_settings');
}

export async function getSystemTrashStats() {
    return invoke('get_system_trash_stats');
}

export function isImagePath(path) {
    const ext = fileExtension(path);
    return IMAGE_EXTENSIONS.has(ext);
}

export function imagePreviewSrc(path) {
    if (!path) return '';
    try {
        return convertFileSrc(path);
    } catch {
        return '';
    }
}

export function fileExtension(path) {
    const name = String(path || '').split('/').pop() || '';
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}
