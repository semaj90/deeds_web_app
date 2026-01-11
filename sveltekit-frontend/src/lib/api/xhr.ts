export type XhrUploadResult = {
	status: number;
	responseText?: string;
};

export function uploadWithXhr(
	url: string,
	formData: FormData,
	onProgress?: (loaded: number): number => void,
	signal?: AbortSignal
): Promise<XhrUploadResult> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', url, true);

		if (signal) {
			signal.addEventListener('abort', () => xhr.abort());
		}

		xhr.upload.onprogress = (ev) => {
			if (ev.lengthComputable && typeof onProgress === 'function') {
				onProgress(ev.loaded, ev.total);
			}
		};

		xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText });
		xhr.onerror = () => reject(new Error('Upload failed'));
		xhr.onabort = () => reject(new Error('Upload aborted'));

		xhr.send(formData);
	});
}

