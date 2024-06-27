import { Dropbox, DropboxAuth, DropboxResponse, files } from "dropbox";
import { debounce } from "obsidian";
import { batchProcess } from "src/utils";
import type { Folder } from "../types";

type DropboxAccount = {
	accountId: string;
	email: string;
};

type DropboxState = {
	account: DropboxAccount;
};

const BATCH_DELAY_TIME = 1000;

export const REDIRECT_URI = "obsidian://connect-dropbox";
export const CLIENT_ID = "vofawt4jgywrgey";

export const DROPBOX_PROVIDER_ERRORS = {
	authenticationError: "Auth Error: Unable to authenticate with dropbox",
	revocationError: "Revokeation Error: Unable to revoke dropbox token",
	resourceAccessError:
		"Resource Access Error: Unable to access Drpobox resource",
};

let instance: DropboxProvider | undefined;

export class DropboxProvider {
	dropbox: Dropbox;
	dropboxAuth: DropboxAuth;
	state = {} as DropboxState;

	static resetInstance() {
		instance = undefined;
	}

	constructor() {
		if (instance) return instance;

		this.dropboxAuth = new DropboxAuth({
			clientId: CLIENT_ID,
		});

		this.dropbox = new Dropbox({
			auth: this.dropboxAuth,
		});

		instance = this;
		return instance;
	}

	/* Start Authentication and Authorization */
	getAuthenticationUrl(): Promise<String> {
		return this.dropboxAuth
			.getAuthenticationUrl(
				REDIRECT_URI, // redirectUri
				undefined, // state
				"code", // authType
				"offline", // tokenAccessType
				undefined, // scope
				undefined, // includeGrantedScopes
				true, // usePKCE
			)
			.catch((_e) => {
				throw new Error(DROPBOX_PROVIDER_ERRORS.authenticationError);
			});
	}

	getCodeVerifier(): string {
		return this.dropboxAuth.getCodeVerifier();
	}

	setCodeVerifier(codeVerifier: string): void {
		return this.dropboxAuth.setCodeVerifier(codeVerifier);
	}

	async setAccessAndRefreshToken(
		authorizationCode: string,
	): Promise<{ refreshToken: string }> {
		try {
			const {
				result: { access_token, refresh_token },
			} = (await this.dropboxAuth.getAccessTokenFromCode(
				REDIRECT_URI,
				authorizationCode,
			)) as DropboxResponse<{
				access_token: string;
				refresh_token: string;
			}>;

			this.dropboxAuth.setAccessToken(access_token);
			this.dropboxAuth.setRefreshToken(refresh_token);

			return { refreshToken: refresh_token };
		} catch (_e) {
			throw new Error(DROPBOX_PROVIDER_ERRORS.authenticationError);
		}
	}

	revokeAuthorizationToken(): Promise<void> {
		return this.dropbox
			.authTokenRevoke()
			.then(() => {
				this.state = {} as DropboxState;
			})
			.catch((_e: any) => {
				throw new Error(DROPBOX_PROVIDER_ERRORS.revocationError);
			});
	}

	authorizeWithRefreshToken(refreshToken: string): void {
		this.dropboxAuth.setRefreshToken(refreshToken);
		this.dropboxAuth.refreshAccessToken();
	}

	getAuthorizationState(): Promise<boolean> {
		return this.dropbox
			.checkUser({})
			.then(() => true)
			.catch(() => false);
	}
	/* End Authentication and Authorization */

	listFolders(root = ""): Promise<Folder[]> {
		return this.dropbox
			.filesListFolder({ path: root })
			.then((res) => {
				return res.result.entries
					.filter((entry) => entry[".tag"] === "folder")
					.map((folder) => {
						return {
							name: folder.name,
							path: folder.path_lower,
							displayPath: folder.path_display,
						} as Folder;
					});
			})
			.catch((e: any) => {
				console.error("listFolders error:", e);
				throw new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError);
			});
	}

	addFolder(path: string) {
		return new Promise<void>((resolve, reject) => {
			this.dropbox
				.filesCreateFolderV2({ path })
				.then(function () {
					resolve();
				})
				.catch(function () {
					reject(
						new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError),
					);
				});
		});
	}

	getUserInfo(): Promise<void> {
		return this.dropbox
			.usersGetCurrentAccount()
			.then((response) => {
				this.state.account = {
					accountId: response.result.account_id,
					email: response.result.email,
				};
			})
			.catch((_e: any) => {
				throw new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError);
			});
	}

	createFolder(path: string) {
		this.dropbox
			.filesCreateFolderV2({ path })
			.then((res) => {
				console.log("filesCreateFolderV2 Res:", res);
			})
			.catch((e: any) => {
				console.error("Dropbox filesCreateFolderV2 Error:", e);
			});
	}

	renameFolderOrFile(fromPath: string, toPath: string) {
		console.log("renameFolder");

		return this.dropbox
			.filesMoveV2({ from_path: fromPath, to_path: toPath })
			.then((res) => {
				console.log("filesMoveV2 Res:", res);
			})
			.catch((e: any) => {
				console.error("Dropbox filesMoveV2 Error:", e);
			});
	}

	deleteFolderOrFile = batchProcess(
		this._deleteFolderOfFile.bind(this),
		BATCH_DELAY_TIME,
	);

	private _deleteFolderOfFile(paths: string[]) {
		console.log("deleting paths:", paths);
		this.dropbox
			.filesDeleteBatch({ entries: paths.map((path) => ({ path })) })
			.then((res) => {
				// This returns a job id that needs to be checked to confirm
				// if the process was successful. this will require a quing process
				// for the plugin to continue to check if there are sync issues
				console.log("filesDeleteBatch Res:", res);
			})
			.catch((e: any) => {
				console.error("Dropbox filesDeleteBatch Error:", e);
			});
	}

	// Notes
	createFile(path: string, contents: ArrayBuffer) {
		return this.dropbox
			.filesUpload({
				path: path,
				contents: contents,
			})
			.then((res) => {
				console.log("filesUpload Res:", res);
			})
			.catch((e: any) => {
				console.error("Dropbox filesUpload Error:", e);
			});
	}

	renameFile() {}

	modifyFile() {}

	deleteFile() {}

	newNote() {}

	/*
	uploadFile(args: files.UploadArg) {
		console.log("Upload args:", args);
		// 150 MB max file size
		return this.dropbox.filesUpload({
			path: args.path,
			contents: args.contents,
			// mode: {
			// 	'.tag': 'update',
			// 	update:
			// }
		});
	}
	*/
}
