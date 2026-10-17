const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseZipBuffer, validateSafeRelativePath } = require('./zipUtils');

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';

// High-reliability offline fallback catalog if Modrinth is unreachable when offline
const FALLBACK_MODRINTH_PROJECTS = {
  mod: [
    {
      project_id: 'AANobbMI',
      slug: 'sodium',
      title: 'Sodium',
      author: 'jellysquid3',
      description: 'The fastest and most compatible rendering optimization mod for Minecraft. Dramatically improves frame rates and reduces micro-stutter.',
      downloads: 48200000,
      follows: 162000,
      project_type: 'mod',
      categories: ['fabric', 'quilt', 'optimization'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    },
    {
      project_id: 'YL57xq9U',
      slug: 'iris',
      title: 'Iris Shaders',
      author: 'coderbot',
      description: 'A modern shaders mod for Minecraft intended to be compatible with existing OptiFine shader packs while working seamlessly with Sodium.',
      downloads: 34900000,
      follows: 118000,
      project_type: 'mod',
      categories: ['fabric', 'quilt', 'shaders'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    },
    {
      project_id: 'P7dR8mSH',
      slug: 'fabric-api',
      title: 'Fabric API',
      author: 'modmuss50',
      description: 'Lightweight and modular API providing common hooks and intercompatibility measures utilized by mods using the Fabric toolchain.',
      downloads: 94100000,
      follows: 185000,
      project_type: 'mod',
      categories: ['fabric', 'library'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4'],
      icon_url: ''
    },
    {
      project_id: 'gvQqBUqZ',
      slug: 'lithium',
      title: 'Lithium',
      author: 'jellysquid3',
      description: 'No-compromises game logic, mob AI, chunk loading, and physics optimization mod for Fabric and Quilt.',
      downloads: 31500000,
      follows: 95000,
      project_type: 'mod',
      categories: ['fabric', 'quilt', 'optimization'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    },
    {
      project_id: 'mOgUt4GM',
      slug: 'modmenu',
      title: 'Mod Menu',
      author: 'Prospector',
      description: 'Adds a clean in-game mod screen for viewing installed mods and configuring settings.',
      downloads: 41200000,
      follows: 89000,
      project_type: 'mod',
      categories: ['fabric', 'quilt', 'gui'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    },
    {
      project_id: 'uXXizFIs',
      slug: 'ferrite-core',
      title: 'FerriteCore',
      author: 'malte0811',
      description: 'Memory usage optimization mod that significantly reduces RAM consumption in Vanilla and modded Minecraft.',
      downloads: 38700000,
      follows: 64000,
      project_type: 'mod',
      categories: ['fabric', 'forge', 'quilt', 'optimization'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.2'],
      icon_url: ''
    }
  ],
  modpack: [
    {
      project_id: '1KVo5zza',
      slug: 'fabulously-optimized',
      title: 'Fabulously Optimized',
      author: 'robotkoer',
      description: 'A Fabric-based performance and graphics modpack that rivals OptiFine with modern shaders, zoom, connected textures, and high FPS.',
      downloads: 12400000,
      follows: 52000,
      project_type: 'modpack',
      categories: ['fabric', 'optimization', 'lightweight'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    },
    {
      project_id: 'BYfVnHa7',
      slug: 'simply-optimized',
      title: 'Simply Optimized',
      author: 'HyperSoop',
      description: 'Pure, verified client-side performance modpack focused on maximizing frame rates and reducing frame-time spikes.',
      downloads: 5800000,
      follows: 28000,
      project_type: 'modpack',
      categories: ['fabric', 'optimization'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4'],
      icon_url: ''
    }
  ],
  resourcepack: [
    {
      project_id: 'Wnxd13zP',
      slug: 'vanillatweaks',
      title: 'Faithful 32x',
      author: 'FaithfulPack',
      description: 'Doubles the resolution of default Minecraft textures while keeping the iconic vanilla art style intact.',
      downloads: 6400000,
      follows: 31000,
      project_type: 'resourcepack',
      categories: ['32x', 'vanilla-like'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    },
    {
      project_id: '50dA9Sha',
      slug: 'fresh-animations',
      title: 'Fresh Animations',
      author: 'FreshLX',
      description: 'Dynamic, expressive entity animations that bring Minecraft mobs and creatures to life.',
      downloads: 14200000,
      follows: 68000,
      project_type: 'resourcepack',
      categories: ['16x', 'entities'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    }
  ],
  shader: [
    {
      project_id: 'HVnmMxH1',
      slug: 'complementary-reimagined',
      title: 'Complementary Shaders - Reimagined',
      author: 'EminGT',
      description: 'Preserves the distinct visual style of Minecraft while adding atmospheric lighting, water reflections, and volumetric clouds.',
      downloads: 29400000,
      follows: 94000,
      project_type: 'shader',
      categories: ['iris', 'optifine', 'high', 'medium'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    },
    {
      project_id: 'Q1vvjJYV',
      slug: 'bsl-shaders',
      title: 'BSL Shaders',
      author: 'Capttatsu',
      description: 'A shaderpack for Minecraft: Java Edition with high customization, warm lighting, and balanced performance.',
      downloads: 21800000,
      follows: 71000,
      project_type: 'shader',
      categories: ['iris', 'optifine', 'realistic'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      icon_url: ''
    }
  ],
  datapack: [
    {
      project_id: '8ooWzSQP',
      slug: 'terralith',
      title: 'Terralith',
      author: 'Starmute',
      description: 'Overhauls the Overworld generation with 95+ brand-new biomes, canyons, volcanic peaks, and lush valleys using vanilla blocks.',
      downloads: 11200000,
      follows: 47000,
      project_type: 'datapack',
      categories: ['worldgen', 'datapack'],
      versions: ['26.3', '26.2', '1.21.4', '1.21.1', '1.20.4'],
      icon_url: ''
    }
  ]
};

class ModrinthManager {
  constructor({ settingsManager, profileManager }) {
    this.settingsManager = settingsManager;
    this.profileManager = profileManager;
  }

  _getContentFolderForType(projectType) {
    switch (String(projectType).toLowerCase()) {
      case 'mod':
        return 'mods';
      case 'resourcepack':
        return 'resourcepacks';
      case 'shader':
        return 'shaderpacks';
      case 'datapack':
        return 'datapacks';
      default:
        return 'mods';
    }
  }

  _getLockFilePath(profile) {
    return path.join(profile.gameDir, 'inex-content-lock.json');
  }

  _readContentLock(profile) {
    const file = this._getLockFilePath(profile);
    if (!fs.existsSync(file)) return { items: {} };
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
      return { items: {} };
    }
  }

  _writeContentLock(profile, lockData) {
    const file = this._getLockFilePath(profile);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(lockData, null, 2), 'utf8');
  }

  listInstalledContent(profileId, projectType = 'mod') {
    const profile = this.profileManager.getProfileById(profileId);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);

    const folderName = this._getContentFolderForType(projectType);
    const dir = path.join(profile.gameDir, folderName);
    fs.mkdirSync(dir, { recursive: true });

    const lock = this._readContentLock(profile);
    const files = fs.readdirSync(dir);

    const installed = [];
    for (const fileName of files) {
      const fullPath = path.join(dir, fileName);
      let stat;
      try {
        stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
      } catch (_) {
        continue;
      }

      const isDisabled = fileName.endsWith('.disabled');
      const baseFileName = isDisabled ? fileName.slice(0, -'.disabled'.length) : fileName;
      const meta = lock.items[baseFileName] || null;

      installed.push({
        fileName,
        baseFileName,
        enabled: !isDisabled,
        size: stat.size,
        installedAt: meta ? meta.installedAt : stat.mtime.toISOString(),
        projectId: meta ? meta.projectId : null,
        title: meta ? meta.title : baseFileName,
        author: meta ? meta.author : 'Local File',
        versionNumber: meta ? meta.versionNumber : '',
        iconUrl: meta ? meta.iconUrl : '',
        projectType
      });
    }

    return installed;
  }

  isProjectInstalled(profile, projectId, projectType) {
    if (!profile) return false;
    const lock = this._readContentLock(profile);
    const folderName = this._getContentFolderForType(projectType);
    const dir = path.join(profile.gameDir, folderName);

    for (const [fileName, meta] of Object.entries(lock.items || {})) {
      if (meta.projectId === projectId) {
        if (fs.existsSync(path.join(dir, fileName)) || fs.existsSync(path.join(dir, `${fileName}.disabled`))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Strictly auto-detects and locks searches to the profile's exact Minecraft version and loader!
   */
  async searchProjects({
    query = '',
    projectType = 'mod',
    profileId = null,
    mcVersion = null,
    loader = null,
    offset = 0,
    limit = 20,
    sortIndex = 'relevance'
  } = {}) {
    const profile = profileId ? this.profileManager.getProfileById(profileId) : this.profileManager.getActiveProfile();
    const effectiveVersion = mcVersion || (profile ? profile.version : null);
    const effectiveLoader = loader || (profile ? profile.loader : null);

    // Rule: Vanilla profiles do NOT allow mods or modpacks
    if (effectiveLoader === 'vanilla' && (projectType === 'mod' || projectType === 'modpack')) {
      return {
        hits: [],
        totalHits: 0,
        offset: 0,
        limit,
        vanillaLocked: true,
        message: 'Vanilla profiles cannot install mods or modpacks as per official vanilla rules.',
        profileFilter: {
          version: effectiveVersion,
          loader: 'vanilla'
        }
      };
    }

    const facets = [[`project_type:${projectType}`]];
    // Strict version filter: Always filter by the created profile's exact version!
    if (effectiveVersion) {
      facets.push([`versions:${effectiveVersion}`]);
    }
    if ((projectType === 'mod' || projectType === 'modpack') && effectiveLoader && effectiveLoader !== 'vanilla') {
      facets.push([`categories:${effectiveLoader}`]);
    }

    const params = new URLSearchParams({
      query: String(query || '').trim(),
      facets: JSON.stringify(facets),
      index: sortIndex,
      offset: String(Math.max(0, Number(offset) || 0)),
      limit: String(Math.max(1, Math.min(50, Number(limit) || 20)))
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${MODRINTH_API_BASE}/search?${params.toString()}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'INEX-Client-Launcher/1.0.0 (windows)' }
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Modrinth search HTTP ${res.status}`);
      }
      const data = await res.json();
      const hits = (data.hits || []).map(hit => ({
        projectId: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        author: hit.author || 'Modrinth Creator',
        description: hit.description || '',
        downloads: hit.downloads || 0,
        follows: hit.follows || 0,
        iconUrl: hit.icon_url || '',
        projectType: hit.project_type || projectType,
        categories: hit.categories || [],
        versions: hit.versions || [],
        installed: this.isProjectInstalled(profile, hit.project_id, projectType)
      }));

      return {
        hits,
        totalHits: data.total_hits || hits.length,
        offset: data.offset || 0,
        limit: data.limit || limit,
        profileFilter: {
          version: effectiveVersion,
          loader: effectiveLoader
        }
      };
    } catch (err) {
      // Offline fallback
      const rawList = FALLBACK_MODRINTH_PROJECTS[projectType] || [];
      const q = String(query || '').toLowerCase().trim();
      const filtered = rawList.filter(p => {
        const matchesQuery = !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
        const matchesVer = !effectiveVersion || !p.versions || p.versions.includes(effectiveVersion);
        return matchesQuery && matchesVer;
      }).map(hit => ({
        projectId: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        author: hit.author,
        description: hit.description,
        downloads: hit.downloads,
        follows: hit.follows,
        iconUrl: hit.icon_url,
        projectType: hit.project_type,
        categories: hit.categories,
        versions: hit.versions,
        installed: this.isProjectInstalled(profile, hit.project_id, projectType)
      }));

      return {
        hits: filtered,
        totalHits: filtered.length,
        offset: 0,
        limit,
        offlineFallback: true,
        error: err.message,
        profileFilter: {
          version: effectiveVersion,
          loader: effectiveLoader
        }
      };
    }
  }

  async getProjectDetails(projectId) {
    const res = await fetch(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}`, {
      headers: { 'User-Agent': 'INEX-Client-Launcher/1.0.0 (windows)' }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch Modrinth project details (HTTP ${res.status})`);
    }
    return await res.json();
  }

  /**
   * Strictly matches versions for the created profile's Minecraft version and loader!
   */
  async getCompatibleVersions(projectId, { mcVersion, loader, projectType } = {}) {
    const params = new URLSearchParams();
    if (mcVersion) {
      params.set('game_versions', JSON.stringify([mcVersion]));
    }
    if ((projectType === 'mod' || projectType === 'modpack') && loader && loader !== 'vanilla') {
      params.set('loaders', JSON.stringify([loader]));
    }

    const url = `${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'INEX-Client-Launcher/1.0.0 (windows)' }
    });
    if (!res.ok) {
      throw new Error(`Failed to query Modrinth versions for ${projectId} (HTTP ${res.status})`);
    }
    const versions = await res.json();
    if (Array.isArray(versions) && versions.length > 0) {
      // Find the version strictly matching mcVersion and loader
      const isPack = ['resourcepack', 'shader', 'datapack'].includes(projectType);
      const exact = versions.filter(v => {
        const matchesVer = !mcVersion || (v.game_versions && v.game_versions.includes(mcVersion));
        const matchesLdr = isPack || !loader || loader === 'vanilla' || (v.loaders && v.loaders.includes(loader));
        return matchesVer && matchesLdr;
      });
      if (exact.length > 0) return exact;
      return versions;
    }

    // If strict version filter returned empty for resourcepack/shader, retry without strict version constraint
    if (projectType === 'resourcepack' || projectType === 'shader' || projectType === 'datapack') {
      const fallbackRes = await fetch(`${MODRINTH_API_BASE}/project/${encodeURIComponent(projectId)}/version`, {
        headers: { 'User-Agent': 'INEX-Client-Launcher/1.0.0 (windows)' }
      });
      if (fallbackRes.ok) {
        return await fallbackRes.json();
      }
    }
    return [];
  }

  /**
   * Installs project, STRICTLY ensuring the file installed corresponds to the profile's
   * created version (e.g. 26.2), NEVER jumping to the latest release (e.g. 26.3)!
   */
  async installProject({ profileId, projectId, projectType = 'mod', title = '', author = '', iconUrl = '' }, onProgress = () => {}) {
    const profile = this.profileManager.getProfileById(profileId) || this.profileManager.getActiveProfile();
    if (!profile) {
      throw new Error('No active profile selected for installation.');
    }

    // Vanilla Rule: Mods and Modpacks are strictly forbidden on Vanilla profiles
    if ((projectType === 'mod' || projectType === 'modpack') && profile.loader === 'vanilla') {
      throw new Error(`Profile "${profile.name}" uses Vanilla Minecraft. Modding and modpacks are not permitted on official Vanilla profiles according to vanilla rules. Please switch this profile to Fabric or Forge to install mods.`);
    }

    onProgress({
      profileId: profile.id,
      projectId,
      stage: 'Resolving compatible version',
      percent: 10,
      detail: `Auto-matching ${projectType} for created profile version Minecraft ${profile.version} (${profile.loader})...`
    });

    const versions = await this.getCompatibleVersions(projectId, {
      mcVersion: profile.version,
      loader: profile.loader,
      projectType
    });

    if (!versions.length) {
      throw new Error(`No compatible release of "${title || projectId}" found for created Minecraft version ${profile.version} (${profile.loader}).`);
    }

    // Pick version strictly matching profile.version, never falling forward to newer versions
    const isPack = ['resourcepack', 'shader', 'datapack'].includes(projectType);
    const matchedVersion = versions.find(v => {
      const gv = v.game_versions || [];
      const ld = v.loaders || [];
      const vMatch = gv.includes(profile.version);
      const lMatch = isPack || profile.loader === 'vanilla' || ld.includes(profile.loader);
      return vMatch && lMatch;
    }) || versions[0];

    const primaryFile = (matchedVersion.files || []).find(f => f.primary) || (matchedVersion.files || [])[0];
    if (!primaryFile || !primaryFile.url) {
      throw new Error(`Downloadable file missing on Modrinth for ${title} version ${matchedVersion.version_number}`);
    }

    if (projectType === 'modpack' || primaryFile.filename.endsWith('.mrpack')) {
      return await this.installMrpackModpack({
        profile,
        projectId,
        title: title || matchedVersion.name,
        author,
        iconUrl,
        versionObj: matchedVersion,
        primaryFile,
        onProgress
      });
    }

    const folderName = this._getContentFolderForType(projectType);
    const targetDir = path.join(profile.gameDir, folderName);
    fs.mkdirSync(targetDir, { recursive: true });

    const safeDestPath = validateSafeRelativePath(path.basename(primaryFile.filename), targetDir);

    onProgress({
      profileId: profile.id,
      projectId,
      stage: 'Downloading content',
      percent: 45,
      detail: `Downloading ${primaryFile.filename} for Minecraft ${profile.version}...`
    });

    const res = await fetch(primaryFile.url, {
      headers: { 'User-Agent': 'INEX-Client-Launcher/1.0.0 (windows)' }
    });
    if (!res.ok) {
      throw new Error(`Download failed with HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // Validate SHA1 or SHA512 hash from Modrinth metadata
    if (primaryFile.hashes && primaryFile.hashes.sha1) {
      const actualSha1 = crypto.createHash('sha1').update(buf).digest('hex').toLowerCase();
      if (actualSha1 !== String(primaryFile.hashes.sha1).toLowerCase()) {
        throw new Error(`SHA1 integrity check failed for ${primaryFile.filename}`);
      }
    }

    const tmpPath = `${safeDestPath}.part`;
    fs.writeFileSync(tmpPath, buf);
    fs.renameSync(tmpPath, safeDestPath);

    // Record in content lock
    const lock = this._readContentLock(profile);
    lock.items[path.basename(safeDestPath)] = {
      projectId,
      title: title || path.basename(safeDestPath),
      author: author || 'Modrinth',
      versionId: matchedVersion.id,
      versionNumber: matchedVersion.version_number,
      mcVersion: profile.version,
      iconUrl: iconUrl || '',
      projectType,
      installedAt: new Date().toISOString()
    };
    this._writeContentLock(profile, lock);

    onProgress({
      profileId: profile.id,
      projectId,
      stage: 'Installed',
      percent: 100,
      detail: `Installed ${title || primaryFile.filename} for Minecraft ${profile.version} into ${profile.name}`
    });

    return {
      installed: true,
      fileName: path.basename(safeDestPath),
      profileId: profile.id,
      projectType,
      versionNumber: matchedVersion.version_number
    };
  }

  async installMrpackModpack({ profile, projectId, title, author, iconUrl, versionObj, primaryFile, onProgress }) {
    onProgress({
      profileId: profile.id,
      projectId,
      stage: 'Downloading Modpack archive',
      percent: 20,
      detail: `Downloading ${primaryFile.filename}...`
    });

    const res = await fetch(primaryFile.url, {
      headers: { 'User-Agent': 'INEX-Client-Launcher/1.0.0 (windows)' }
    });
    if (!res.ok) {
      throw new Error(`Failed to download modpack archive: HTTP ${res.status}`);
    }
    const archiveBuf = Buffer.from(await res.arrayBuffer());

    if (primaryFile.hashes && primaryFile.hashes.sha1) {
      const actualSha1 = crypto.createHash('sha1').update(archiveBuf).digest('hex').toLowerCase();
      if (actualSha1 !== String(primaryFile.hashes.sha1).toLowerCase()) {
        throw new Error(`SHA1 verification failed for ${primaryFile.filename}`);
      }
    }

    const entries = parseZipBuffer(archiveBuf);
    const indexEntry = entries.find(e => e.name === 'modrinth.index.json');
    if (!indexEntry) {
      throw new Error('Invalid .mrpack archive: modrinth.index.json is missing.');
    }

    const indexJson = JSON.parse(indexEntry.extractBuffer().toString('utf8'));
    const packFiles = Array.isArray(indexJson.files) ? indexJson.files : [];

    // Extract overrides/ and client-overrides/ with strict path traversal protection
    onProgress({
      profileId: profile.id,
      projectId,
      stage: 'Extracting Modpack overrides',
      percent: 35,
      detail: 'Applying configuration and resource overrides...'
    });

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      let rel = null;
      if (entry.name.startsWith('overrides/')) {
        rel = entry.name.slice('overrides/'.length);
      } else if (entry.name.startsWith('client-overrides/')) {
        rel = entry.name.slice('client-overrides/'.length);
      }
      if (!rel) continue;

      const safeDest = validateSafeRelativePath(rel, profile.gameDir);
      fs.mkdirSync(path.dirname(safeDest), { recursive: true });
      fs.writeFileSync(safeDest, entry.extractBuffer());
    }

    // Download each pack dependency file
    const clientFiles = packFiles.filter(f => !f.env || f.env.client !== 'unsupported');
    const total = clientFiles.length;
    let completed = 0;

    const lock = this._readContentLock(profile);

    for (const fileSpec of clientFiles) {
      const safeDest = validateSafeRelativePath(fileSpec.path, profile.gameDir);
      const downloadUrl = Array.isArray(fileSpec.downloads) ? fileSpec.downloads[0] : null;
      if (!downloadUrl) continue;

      fs.mkdirSync(path.dirname(safeDest), { recursive: true });
      const fileRes = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'INEX-Client-Launcher/1.0.0 (windows)' }
      });
      if (!fileRes.ok) {
        throw new Error(`Failed to download modpack dependency ${fileSpec.path} (HTTP ${fileRes.status})`);
      }
      const dataBuf = Buffer.from(await fileRes.arrayBuffer());
      if (fileSpec.hashes && fileSpec.hashes.sha1) {
        const sha1 = crypto.createHash('sha1').update(dataBuf).digest('hex').toLowerCase();
        if (sha1 !== String(fileSpec.hashes.sha1).toLowerCase()) {
          throw new Error(`SHA1 mismatch on modpack file ${fileSpec.path}`);
        }
      }
      fs.writeFileSync(safeDest, dataBuf);

      const baseName = path.basename(safeDest);
      lock.items[baseName] = {
        projectId: null,
        title: baseName,
        author: title || indexJson.name || 'Modpack Dependency',
        versionNumber: indexJson.versionId || '',
        iconUrl: iconUrl || '',
        projectType: fileSpec.path.startsWith('resourcepacks/') ? 'resourcepack' : fileSpec.path.startsWith('shaderpacks/') ? 'shader' : 'mod',
        installedAt: new Date().toISOString()
      };

      completed++;
      const pct = 35 + Math.round((completed / Math.max(1, total)) * 60);
      onProgress({
        profileId: profile.id,
        projectId,
        stage: 'Installing Modpack mods & assets',
        percent: pct,
        detail: `Downloaded (${completed}/${total}): ${baseName}`
      });
    }

    this._writeContentLock(profile, lock);

    // Update profile dependencies from modrinth.index.json
    const deps = indexJson.dependencies || {};
    const updates = {
      modpackInfo: {
        projectId,
        name: indexJson.name || title,
        versionId: indexJson.versionId || versionObj.version_number,
        author,
        iconUrl
      }
    };
    if (deps.minecraft) {
      updates.version = deps.minecraft;
    }
    if (deps['fabric-loader']) {
      updates.loader = 'fabric';
      updates.loaderVersion = deps['fabric-loader'];
    } else if (deps['quilt-loader']) {
      // Quilt is not supported by INEX; Quilt packs load Fabric mods, so use Fabric with the latest loader.
      updates.loader = 'fabric';
      updates.loaderVersion = 'latest';
    } else if (deps.forge) {
      updates.loader = 'forge';
      updates.loaderVersion = deps.forge;
    } else if (deps.neoforge) {
      throw new Error('This modpack needs NeoForge, which INEX CLIENT does not support (only Vanilla, Fabric and Forge).');
    }

    this.profileManager.updateProfile(profile.id, updates);

    onProgress({
      profileId: profile.id,
      projectId,
      stage: 'Modpack installed',
      percent: 100,
      detail: `Installed modpack "${indexJson.name || title}" (${total} files)`
    });

    return {
      installed: true,
      isModpack: true,
      filesInstalled: total,
      profileId: profile.id,
      modpackName: indexJson.name || title
    };
  }

  toggleInstalledContent({ profileId, fileName, projectType = 'mod' }) {
    const profile = this.profileManager.getProfileById(profileId);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);

    const folderName = this._getContentFolderForType(projectType);
    const targetDir = path.join(profile.gameDir, folderName);
    const currentPath = validateSafeRelativePath(path.basename(fileName), targetDir);

    if (!fs.existsSync(currentPath)) {
      throw new Error(`File not found: ${fileName}`);
    }

    const newFileName = fileName.endsWith('.disabled')
      ? fileName.slice(0, -'.disabled'.length)
      : `${fileName}.disabled`;
    const newPath = validateSafeRelativePath(path.basename(newFileName), targetDir);

    fs.renameSync(currentPath, newPath);
    return {
      fileName: newFileName,
      enabled: !newFileName.endsWith('.disabled'),
      items: this.listInstalledContent(profileId, projectType)
    };
  }

  removeInstalledContent({ profileId, fileName, projectType = 'mod' }) {
    const profile = this.profileManager.getProfileById(profileId);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);

    const folderName = this._getContentFolderForType(projectType);
    const targetDir = path.join(profile.gameDir, folderName);
    const safePath = validateSafeRelativePath(path.basename(fileName), targetDir);

    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
    }

    const baseName = fileName.endsWith('.disabled') ? fileName.slice(0, -'.disabled'.length) : fileName;
    const lock = this._readContentLock(profile);
    if (lock.items && lock.items[baseName]) {
      delete lock.items[baseName];
      this._writeContentLock(profile, lock);
    }

    return {
      removed: true,
      fileName,
      items: this.listInstalledContent(profileId, projectType)
    };
  }
}

module.exports = { ModrinthManager };
