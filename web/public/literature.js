// Reading list for the Literature tab. Paper identities and links were checked
// against arXiv / publisher pages (reading pack: literature/supervisor-reading-pack.md,
// 2026-10-03; model and dataset papers: arXiv API, 2026-10-08). Summaries are
// orientation notes, not results: check exact numbers in each paper's tables.

export const RESEARCH_QUESTIONS = [
  { id: 1, short: 'Cost of privacy', text: 'How large is the performance gap between a pose-only (skeleton) detector and an efficient RGB detector on real-world fight benchmarks?' },
  { id: 2, short: 'False alarms', text: 'Can interaction-aware pose features plus hard-negative training lower false alarms on look-alike activities (hugging, dancing, sport) at a fixed recall?' },
  { id: 3, short: 'Deployability', text: 'How many CCTV feeds can each approach handle in real time on one on-prem box, and is pose estimation or classification the bottleneck?' },
];

export const THEMES = {
  data: 'Datasets & benchmarks',
  pose: 'Pose & skeleton',
  privacy: 'Privacy',
  efficient: 'Video backbones',
  vl: 'Vision-language',
  anomaly: 'Anomaly & interaction',
};

export const PAPERS = [
  {
    title: 'Modeling Human Skeleton Joint Dynamics for Fall Detection',
    authors: 'Sania Zahan, Ghulam Mubashar Hassan, Ajmal Mian', venue: 'arXiv', year: 2025,
    url: 'https://arxiv.org/abs/2503.06938', theme: 'pose', rq: [1, 3], uwa: true,
    offers: 'An efficient graph model of skeleton joint dependencies over time for fall detection, with privacy as part of the motivation.',
    why: 'From Prof. Mian\'s group at UWA. Same recipe as the planned approach (skeleton + temporal graph model), applied to a related safety problem.',
    limit: 'Falls are one person; fights are two or more interacting. A smaller classifier does not remove the cost or failure modes of extracting pose from CCTV.',
    question: 'What must change to represent interactions between two people?',
  },
  {
    title: 'Human Skeletons and Change Detection for Efficient Violence Detection in Surveillance Videos',
    authors: 'Guillermo Garcia-Cobo, Juan C. SanMiguel', venue: 'Computer Vision and Image Understanding', year: 2023,
    url: 'https://doi.org/10.1016/j.cviu.2023.103739', theme: 'pose', rq: [1, 2, 3],
    offers: 'A violence detector combining pose extraction, change detection and ConvLSTM temporal modelling.',
    why: 'Closest prior work to the proposed efficient pose-based fight detector.',
    limit: 'Combines skeleton and change information, so it is not a strictly pose-only baseline. Check whether reported compute includes all preprocessing.',
    question: 'What would interaction features or hard-negative training add beyond this method?',
  },
  {
    title: 'Spatial Temporal Graph Convolutional Networks for Skeleton-Based Action Recognition (ST-GCN)',
    authors: 'Sijie Yan, Yuanjun Xiong, Dahua Lin', venue: 'AAAI', year: 2018,
    url: 'https://arxiv.org/abs/1801.07455', theme: 'pose', rq: [1],
    offers: 'Treats the skeleton as a graph (joints = nodes, bones = edges) and convolves over the graph and over time.',
    why: 'The standard skeleton action-recognition baseline; the starting point for a pose-only fight classifier.',
    limit: 'Designed for one-person actions on clean pose data; no explicit modelling of person-to-person interaction.',
    question: 'How do we feed two people\'s skeletons in, and what happens when joints are missing?',
  },
  {
    title: 'Revisiting Skeleton-based Action Recognition (PoseC3D)',
    authors: 'Haodong Duan, Yue Zhao, Kai Chen, Dahua Lin, Bo Dai', venue: 'CVPR', year: 2022,
    url: 'https://arxiv.org/abs/2104.13586', theme: 'pose', rq: [1, 2],
    offers: 'Renders keypoints as heatmap volumes and runs a 3D CNN on them; more robust to noisy pose estimates than graph models.',
    why: 'A strong alternative pose classifier, and naturally handles multiple people in one heatmap.',
    limit: 'Heavier than ST-GCN; still depends on a pose estimator working on low-resolution CCTV.',
    question: 'Does heatmap input survive the pose quality we actually get on UBI-Fights?',
  },
  {
    title: 'Anonymization for Skeleton Action Recognition',
    authors: 'Saemi Moon et al.', venue: 'arXiv', year: 2021,
    url: 'https://arxiv.org/abs/2111.15129', theme: 'privacy', rq: [1],
    offers: 'Shows skeleton trajectories can leak identity and personal attributes, and proposes an anonymisation method.',
    why: 'Directly challenges the assumption that removing faces guarantees anonymity. Pre-empts the obvious supervisor question.',
    limit: 'Results depend on the data and attack setup; not a universal privacy guarantee.',
    question: 'Which privacy claim can we defend: "anonymous", or the narrower "data-minimising"?',
  },
  {
    title: 'Joint Attribute and Model Generalization Learning for Privacy-Preserving Action Recognition',
    authors: 'Duo Peng, Li Xu, Qiuhong Ke, Ping Hu, Jun Liu', venue: 'NeurIPS', year: 2023,
    url: 'https://proceedings.neurips.cc/paper_files/paper/2023/file/b762632135b16f1225672f9fe2a9740b-Paper-Conference.pdf', theme: 'privacy', rq: [1],
    offers: 'Keeps action information while protecting against unseen private attributes and attack models.',
    why: 'Treats privacy as something to measure, not assert.',
    limit: 'Not evidence that pose-only fight detection is automatically private or real-time.',
    question: 'Should the thesis evaluate privacy leakage directly, or make a narrower data-minimisation claim?',
  },
  {
    title: 'UBI-Fights: Human Activity Analysis: Iterative Weak/Self-Supervised Learning Frameworks for Detecting Abnormal Events',
    authors: 'Bruno Degardin, Hugo Proença', venue: 'IEEE IJCB', year: 2020,
    url: 'https://socia-lab.di.ubi.pt/EventDetection', theme: 'data', rq: [2], used: true,
    offers: '1,000 videos (216 fight, 784 normal), about 80 h, annotated frame by frame; long and untrimmed.',
    why: 'The footage in CCTV Lab. Frame labels make false alarms per hour and event recall measurable.',
    limit: 'Mostly YouTube-sourced CCTV; research use only. Our subset is 78 videos.',
    question: 'Do results on UBI-Fights transfer to other cameras (cross-dataset test)?',
  },
  {
    title: 'RWF-2000: An Open Large Scale Video Database for Violence Detection',
    authors: 'Ming Cheng, Kunjing Cai, Ming Li', venue: 'ICPR', year: 2020,
    url: 'https://arxiv.org/abs/1911.05913', theme: 'data', rq: [1, 2],
    offers: '2,000 five-second surveillance-style clips (fight / non-fight) and a baseline.',
    why: 'The benchmark most fight papers report on; needed to compare with published work.',
    limit: 'A clip classification score cannot establish the number of false alerts during continuous monitoring.',
    question: 'What can this benchmark tell us, and what needs a separate long-footage test?',
  },
  {
    title: 'Real-world Anomaly Detection in Surveillance Videos (UCF-Crime)',
    authors: 'Waqas Sultani, Chen Chen, Mubarak Shah', venue: 'CVPR', year: 2018,
    url: 'https://arxiv.org/abs/1801.04264', theme: 'anomaly', rq: [2],
    offers: 'Long untrimmed CCTV with 13 anomaly types (including fighting); weakly supervised multiple-instance learning from video-level labels.',
    why: 'The classic long-footage surveillance benchmark and training recipe when only video-level labels exist.',
    limit: 'General anomalies, not fights specifically; test-time labels are coarse.',
    question: 'Is a fight-specific model better than a general anomaly detector at a fixed false-alarm rate?',
  },
  {
    title: 'Not only Look, but also Listen: Learning Multimodal Violence Detection under Weak Supervision (XD-Violence)',
    authors: 'Peng Wu et al.', venue: 'ECCV', year: 2020,
    url: 'https://arxiv.org/abs/2007.04687', theme: 'data', rq: [1],
    offers: 'Large audio-visual violence dataset (movies, sport, CCTV and more) with weak labels.',
    why: 'Largest violence dataset; useful for cross-dataset testing.',
    limit: 'Mostly not fixed CCTV; audio is usually unavailable on real cameras.',
    question: 'Which subset resembles fixed-camera CCTV closely enough to test on?',
  },
  {
    title: 'Advancing Video Anomaly Detection: A Concise Review and a New Dataset (MSAD)',
    authors: 'Liyun Zhu, Lei Wang, Arjun Raj, Tom Gedeon, Chen Chen', venue: 'NeurIPS Datasets & Benchmarks', year: 2024,
    url: 'https://neurips.cc/virtual/2024/poster/97585', theme: 'anomaly', rq: [2],
    offers: 'Benchmark covering varied surveillance scenes, viewpoints, lighting and weather.',
    why: 'Frames testing across environments, which is where false alarms come from.',
    limit: 'General anomalies rather than fights; video access needs an application.',
    question: 'Which labels and splits would actually support a fight-detection question?',
  },
  {
    title: 'JRDB-Act: Spatio-temporal Action, Social Group and Activity Detection',
    authors: 'Mahsa Ehsanpour, Fatemeh Saleh, Silvio Savarese, Ian Reid, Hamid Rezatofighi', venue: 'arXiv', year: 2021,
    url: 'https://arxiv.org/abs/2106.08827', theme: 'anomaly', rq: [2],
    offers: 'Labels for individual actions, interactions and social groups.',
    why: 'Supports the focus on interactions: a fight is defined by what two people do to each other.',
    limit: 'Captured from a mobile robot, not fixed CCTV; not a fight benchmark.',
    question: 'What should an interaction representation capture beyond each person\'s own motion?',
  },
  {
    title: 'Soft + Hardwired Attention: An LSTM Framework for Human Trajectory Prediction and Abnormal Event Detection',
    authors: 'Tharindu Fernando, Simon Denman, Sridha Sridharan, Clinton Fookes', venue: 'Neural Networks', year: 2018,
    url: 'https://arxiv.org/abs/1702.05552', theme: 'anomaly', rq: [2],
    offers: 'Predicts movement from a person\'s own and neighbours\' trajectories, applied to abnormal-event detection.',
    why: 'Early evidence that neighbour context helps; relevant to interaction features.',
    limit: 'A trajectory anomaly is not the same as violence.',
    question: 'Does relative body-joint motion add information beyond trajectories?',
  },
  {
    title: 'X3D: Expanding Architectures for Efficient Video Recognition',
    authors: 'Christoph Feichtenhofer', venue: 'CVPR', year: 2020,
    url: 'https://openaccess.thecvf.com/content_CVPR_2020/html/Feichtenhofer_X3D_Expanding_Architectures_for_Efficient_Video_Recognition_CVPR_2020_paper.html', theme: 'efficient', rq: [1, 3],
    offers: 'A family of video networks that trade accuracy against compute.',
    why: 'Candidate efficient RGB baseline to compare the pose model against at the same compute budget.',
    limit: 'Benchmark efficiency is not multi-camera throughput; decoding and preprocessing must be measured too.',
    question: 'Which model size is a fair comparison under the same budget?',
  },
  {
    title: 'Quo Vadis, Action Recognition? A New Model and the Kinetics Dataset (I3D)',
    authors: 'Joao Carreira, Andrew Zisserman', venue: 'CVPR', year: 2017,
    url: 'https://arxiv.org/abs/1705.07750', theme: 'efficient', rq: [1],
    offers: 'Inflates 2D ImageNet filters into 3D and introduces Kinetics, the dataset most video models are pretrained on.',
    why: 'Explains the 3D-CNN family and why "pretrained on Kinetics-400" matters (X-CLIP is).',
    limit: 'Heavy by today\'s standards.',
    question: 'Does Kinetics pretraining help or hurt on grainy top-down CCTV?',
  },
  {
    title: 'VideoMAE: Masked Autoencoders are Data-Efficient Learners for Self-Supervised Video Pre-Training',
    authors: 'Zhan Tong, Yibing Song, Jue Wang, Limin Wang', venue: 'NeurIPS', year: 2022,
    url: 'https://arxiv.org/abs/2203.12602', theme: 'efficient', rq: [1],
    offers: 'Pretrains a video transformer by hiding most patches and reconstructing them; fine-tunes well with little labelled data.',
    why: 'The planned strong pixel-based baseline to beat.',
    limit: 'Heavy at inference; looks at raw pixels.',
    question: 'How close can a pose model get to a fine-tuned VideoMAE?',
  },
  {
    title: 'Learning Transferable Visual Models From Natural Language Supervision (CLIP)',
    authors: 'Alec Radford et al.', venue: 'ICML', year: 2021,
    url: 'https://arxiv.org/abs/2103.00020', theme: 'vl', rq: [2],
    offers: 'Trains image and text encoders contrastively on 400M image-caption pairs, enabling zero-shot classification by text prompts.',
    why: 'The foundation under X-CLIP; explains why we can score video against "people fighting" vs "people hugging".',
    limit: 'Still images only; web photos, not CCTV.',
    question: 'Can text prompts encode the hard negatives we care about?',
  },
  {
    title: 'Expanding Language-Image Pretrained Models for General Video Recognition (X-CLIP)',
    authors: 'Bolin Ni et al.', venue: 'ECCV', year: 2022,
    url: 'https://arxiv.org/abs/2208.02816', theme: 'vl', rq: [1, 2], used: true,
    offers: 'Extends CLIP to video with cross-frame attention and video-specific prompts.',
    why: 'Model 1 in CCTV Lab (zero-shot) and the frozen backbone of the trained head.',
    limit: 'Never trained on fights; zero-shot gives ~49 false alarms/h at 66% event recall on our UBI-Fights subset.',
    question: 'How much of the trained head\'s gain would a pose model keep while dropping pixels?',
  },
  {
    title: 'SmolVLM: Redefining Small and Efficient Multimodal Models',
    authors: 'Andrés Marafioti et al.', venue: 'arXiv', year: 2025,
    url: 'https://arxiv.org/abs/2504.05299', theme: 'vl', rq: [3], used: true,
    offers: 'A family of very small vision-language models (256M to 2.2B parameters) for on-device use.',
    why: 'Model 2 in CCTV Lab: the explainable-caption baseline.',
    limit: 'The 256M model sees single frames and almost always answers "No" to fighting.',
    question: 'Is a larger VLM better used as a second-stage verifier than as a detector?',
  },
];

// Experiment plan: each one tests a hypothesis tied to a research question.
// status: done | running | next | planned
export const EXPERIMENTS = [
  { id: 'E1', status: 'done', rq: [2], title: 'Zero-shot X-CLIP vs a trained head on frozen X-CLIP features',
    hypothesis: 'A small classifier trained on CCTV fight labels cuts false alarms compared with text prompts alone.',
    result: 'All 78 UBI-Fights videos, same 66% event recall: 49.4 → 4.3 false alarms/h (about 11× fewer); segment ROC-AUC 0.74 → 0.82 (5-fold CV grouped by video, nested model selection).' },
  { id: 'E2', status: 'done', rq: [2, 3], title: 'Tiny VLM (SmolVLM-256M) as a frame-level detector',
    hypothesis: 'A small VLM answering "is anyone fighting?" is a usable detector.',
    result: 'Rejected so far: on short clips it almost never answers "Yes" (recall 5% at threshold 0.1). Single frames cannot show motion.' },
  { id: 'E3', status: 'next', rq: [2, 3], title: 'VLM size sweep',
    hypothesis: 'Detection quality and calibration improve with VLM size and native video input, at a measurable compute cost.',
    method: 'SmolVLM2 (256M → 2.2B), Qwen2.5-VL 3B/7B, InternVL3 2B/8B, LLaVA-OneVision 0.5B/7B on the same UBI-Fights segments; report AUC, false alarms/h, seconds per segment.' },
  { id: 'E4', status: 'next', rq: [2, 3], title: 'Cascade: fast detector, then VLM verifier',
    hypothesis: 'Running a large VLM only on clips the fast model flags lowers false alarms at fixed recall while keeping compute per feed low.',
    method: 'Trained head flags candidates → VLM confirms or vetoes; compare false alarms/h and GPU-seconds per camera-hour against each model alone.' },
  { id: 'E5', status: 'planned', rq: [1, 3], title: 'Pose quality audit on real CCTV',
    hypothesis: 'Off-the-shelf pose estimators miss many people in low-resolution, top-down CCTV, and this caps any pose-only detector.',
    method: 'RTMPose, ViTPose, YOLO11-pose on UBI-Fights fight segments: share of frames with ≥ 2 people detected, keypoint confidence, runtime.' },
  { id: 'E6', status: 'planned', rq: [1], title: 'Pose-only vs RGB on identical splits',
    hypothesis: 'A skeleton classifier reaches most of the RGB model\'s accuracy (the "cost of privacy" is small).',
    method: 'ST-GCN / CTR-GCN / PoseC3D vs X-CLIP head, X3D and fine-tuned VideoMAE; same grouped folds; AUC, false alarms/h, event recall.' },
  { id: 'E7', status: 'planned', rq: [2], title: 'Interaction features + hard negatives',
    hypothesis: 'Relative motion between people (distance, wrist/ankle velocity towards another person) separates fights from hugging, dancing and sport.',
    method: 'Add pairwise features to the pose model; build a hard-negative set from public action datasets; measure FPR at fixed recall.' },
  { id: 'E8', status: 'planned', rq: [1, 2], title: 'Cross-dataset generalisation',
    hypothesis: 'Pose models transfer across cameras better than RGB models, because they ignore background and colour.',
    method: 'Train on UBI-Fights, test on RWF-2000 and the CCTV portion of XD-Violence (and the reverse).' },
  { id: 'E9', status: 'planned', rq: [3], title: 'Feeds per device',
    hypothesis: 'Pose estimation, not classification, is the bottleneck; a pose pipeline still supports more feeds per box than RGB transformers.',
    method: 'Throughput and latency per pipeline on an M2 and one on-prem GPU, broken down into decode / pose / classify.' },
  { id: 'E10', status: 'planned', rq: [1], title: 'Privacy leakage of our pose features',
    hypothesis: 'Stored skeleton sequences still leak some identity or attributes (following Moon et al. 2021).',
    method: 'Train an attacker to re-identify people or predict attributes from the features we keep; report what the system must not store.' },
  { id: 'E11', status: 'planned', rq: [2], title: 'Prompt and window ablations for zero-shot models',
    hypothesis: 'Hard-negative prompts and longer windows (2 → 4 → 8 s) reduce false alarms without training.',
    method: 'Prompt ensembles, X-CLIP 16-frame variant, window length and smoothing sweeps; false alarms/h at fixed recall.' },
];

// Candidate models to test. Sizes are parameter counts as published; check each
// licence before use (several are research-only or AGPL).
export const MODEL_BACKLOG = [
  // Vision-language models (detector or verifier)
  { name: 'Qwen2.5-VL', org: 'Alibaba', family: 'VLM', size: '3B / 7B / 72B', input: 'Video', exp: ['E3', 'E4'], note: 'Native video input with timestamps; strong open VLM' },
  { name: 'InternVL3', org: 'Shanghai AI Lab', family: 'VLM', size: '1B – 78B', input: 'Video (frames)', exp: ['E3', 'E4'], note: 'Wide size range for the size sweep' },
  { name: 'LLaVA-OneVision', org: 'LLaVA team', family: 'VLM', size: '0.5B / 7B / 72B', input: 'Video', exp: ['E3'], note: 'Single model for images and video' },
  { name: 'LLaVA-NeXT-Video', org: 'LLaVA team', family: 'VLM', size: '7B / 34B', input: 'Video', exp: ['E3'], note: 'Video-tuned LLaVA' },
  { name: 'Video-LLaVA', org: 'PKU', family: 'VLM', size: '7B', input: 'Video', exp: ['E3'], note: 'Early unified image/video LLM baseline' },
  { name: 'VideoLLaMA3', org: 'Alibaba DAMO', family: 'VLM', size: '2B / 7B', input: 'Video', exp: ['E3', 'E4'], note: 'Video-centric design' },
  { name: 'SmolVLM2', org: 'Hugging Face', family: 'VLM', size: '256M / 500M / 2.2B', input: 'Video', exp: ['E3'], note: 'Direct upgrade path from the current SmolVLM' },
  { name: 'MiniCPM-V 2.6', org: 'OpenBMB', family: 'VLM', size: '8B', input: 'Video', exp: ['E3'], note: 'Efficient on-device VLM with video' },
  { name: 'Phi-3.5-vision', org: 'Microsoft', family: 'VLM', size: '4.2B', input: 'Multi-image', exp: ['E3'], note: 'Small, permissive licence' },
  { name: 'Gemma 3', org: 'Google', family: 'VLM', size: '4B / 12B / 27B', input: 'Images', exp: ['E3'], note: 'Multimodal Gemma; frame sampling needed' },
  { name: 'PaliGemma 2', org: 'Google', family: 'VLM', size: '3B / 10B / 28B', input: 'Images', exp: ['E3'], note: 'Built for fine-tuning on specific tasks' },
  { name: 'Molmo', org: 'Allen AI', family: 'VLM', size: '1B / 7B / 72B', input: 'Images', exp: ['E3'], note: 'Fully open data and weights; can point at people' },
  { name: 'Idefics3', org: 'Hugging Face', family: 'VLM', size: '8B', input: 'Multi-image', exp: ['E3'], note: 'Larger sibling of the SmolVLM line' },
  { name: 'Moondream 2', org: 'Moondream', family: 'VLM', size: '~1.9B', input: 'Images', exp: ['E3'], note: 'Tiny, fast; edge baseline' },
  { name: 'LAVAD (method)', org: 'Zanella et al., CVPR 2024', family: 'VLM', size: 'uses existing VLM + LLM', input: 'Video', exp: ['E4'], note: 'Training-free anomaly detection by captioning + LLM scoring' },
  // Video-text and video foundation models (RGB baselines)
  { name: 'X-CLIP base-patch16 (16 frames)', org: 'Microsoft', family: 'Video-text', size: '~200M', input: '16 frames', exp: ['E11'], note: 'Finer patches and twice the frames of the current model' },
  { name: 'CLIP ViT-L/14', org: 'OpenAI', family: 'Video-text', size: '~430M', input: 'Frames', exp: ['E11'], note: 'Per-frame zero-shot baseline' },
  { name: 'SigLIP 2', org: 'Google', family: 'Video-text', size: '86M – 1B', input: 'Frames', exp: ['E11'], note: 'Stronger CLIP-style encoder' },
  { name: 'ViCLIP', org: 'InternVid', family: 'Video-text', size: 'ViT-L', input: 'Video', exp: ['E1', 'E11'], note: 'Video CLIP trained on 10M video-text pairs' },
  { name: 'InternVideo2', org: 'Shanghai AI Lab', family: 'Video foundation', size: '1B / 6B', input: 'Video', exp: ['E6'], note: 'Strong video features for a trained head' },
  { name: 'VideoMAE / VideoMAE V2', org: 'Nanjing Univ.', family: 'Video foundation', size: '22M – 1B', input: 'Video', exp: ['E6', 'E8'], note: 'Fine-tuned RGB baseline to beat' },
  { name: 'TimeSformer', org: 'Meta', family: 'Video foundation', size: '~120M', input: 'Video', exp: ['E6'], note: 'Divided space-time attention' },
  // Efficient RGB video models
  { name: 'X3D (XS – XL)', org: 'Meta', family: 'Efficient video', size: '~4M – 20M', input: 'Video', exp: ['E6', 'E9'], note: 'Efficient RGB baseline at matched compute' },
  { name: 'MoViNet (A0 – A6)', org: 'Google', family: 'Efficient video', size: '~3M – 31M', input: 'Streaming video', exp: ['E9'], note: 'Streaming inference for live feeds' },
  { name: 'SlowFast R50', org: 'Meta', family: 'Efficient video', size: '~34M', input: 'Video', exp: ['E6'], note: 'Two-pathway 3D CNN; common fight baseline' },
  // Pose estimation
  { name: 'RTMPose', org: 'OpenMMLab (MMPose)', family: 'Pose estimation', size: 't / s / m / l', input: 'Frames', exp: ['E5', 'E9'], note: 'Fast; Apache-2.0' },
  { name: 'ViTPose', org: 'Univ. of Sydney / JD', family: 'Pose estimation', size: 'B – H', input: 'Frames', exp: ['E5'], note: 'Accurate transformer pose' },
  { name: 'YOLO11-pose', org: 'Ultralytics', family: 'Pose estimation', size: 'n – x', input: 'Frames', exp: ['E5', 'E9'], note: 'One-stage detect + pose; AGPL-3.0 (IP flag)' },
  { name: 'HRNet', org: 'Microsoft', family: 'Pose estimation', size: 'W32 / W48', input: 'Frames', exp: ['E5'], note: 'Classic top-down baseline' },
  { name: 'ByteTrack', org: 'ByteDance', family: 'Pose estimation', size: 'tracker', input: 'Detections', exp: ['E5', 'E7'], note: 'Keeps a per-person track ID (not identity) across frames' },
  // Skeleton classifiers
  { name: 'ST-GCN', org: 'CUHK', family: 'Skeleton classifier', size: '~3M', input: 'Skeletons', exp: ['E6'], note: 'Standard graph baseline' },
  { name: 'CTR-GCN', org: 'CAS', family: 'Skeleton classifier', size: '~1.5M', input: 'Skeletons', exp: ['E6', 'E7'], note: 'Learns joint connections per channel' },
  { name: 'MS-G3D', org: 'Univ. of Sydney', family: 'Skeleton classifier', size: '~3M', input: 'Skeletons', exp: ['E6'], note: 'Multi-scale space-time graphs' },
  { name: 'InfoGCN', org: 'SNU', family: 'Skeleton classifier', size: '~1.5M', input: 'Skeletons', exp: ['E6'], note: 'Information-bottleneck skeleton model' },
  { name: 'PoseC3D', org: 'OpenMMLab', family: 'Skeleton classifier', size: '~2M', input: 'Pose heatmaps', exp: ['E6', 'E7'], note: 'Robust to noisy pose; handles several people' },
];

// Authors' abstracts, fetched from the arXiv API on 2026-10-08 (verbatim).
export const ABSTRACTS = {
  "2104.13586": "Human skeleton, as a compact representation of human action, has received increasing attention in recent years. Many skeleton-based action recognition methods adopt graph convolutional networks (GCN) to extract features on top of human skeletons. Despite the positive results shown in previous works, GCN-based methods are subject to limitations in robustness, interoperability, and scalability. In this work, we propose PoseC3D, a new approach to skeleton-based action recognition, which relies on a 3D heatmap stack instead of a graph sequence as the base representation of human skeletons. Compared to GCN-based methods, PoseC3D is more effective in learning spatiotemporal features, more robust against pose estimation noises, and generalizes better in cross-dataset settings. Also, PoseC3D can handle multiple-person scenarios without additional computation cost, and its features can be easily integrated with other modalities at early fusion stages, which provides a great design space to further boost the performance. On four challenging datasets, PoseC3D consistently obtains superior performance, when used alone on skeletons and in combination with the RGB modality.",
  "2103.00020": "State-of-the-art computer vision systems are trained to predict a fixed set of predetermined object categories. This restricted form of supervision limits their generality and usability since additional labeled data is needed to specify any other visual concept. Learning directly from raw text about images is a promising alternative which leverages a much broader source of supervision. We demonstrate that the simple pre-training task of predicting which caption goes with which image is an efficient and scalable way to learn SOTA image representations from scratch on a dataset of 400 million (image, text) pairs collected from the internet. After pre-training, natural language is used to reference learned visual concepts (or describe new ones) enabling zero-shot transfer of the model to downstream tasks. We study the performance of this approach by benchmarking on over 30 different existing computer vision datasets, spanning tasks such as OCR, action recognition in videos, geo-localization, and many types of fine-grained object classification. The model transfers non-trivially to most tasks and is often competitive with a fully supervised baseline without the need for any dataset specific training. For instance, we match the accuracy of the original ResNet-50 on ImageNet zero-shot without needing to use any of the 1.28 million training examples it was trained on. We release our code and pre-trained model weights at https://github.com/OpenAI/CLIP.",
  "1801.07455": "Dynamics of human body skeletons convey significant information for human action recognition. Conventional approaches for modeling skeletons usually rely on hand-crafted parts or traversal rules, thus resulting in limited expressive power and difficulties of generalization. In this work, we propose a novel model of dynamic skeletons called Spatial-Temporal Graph Convolutional Networks (ST-GCN), which moves beyond the limitations of previous methods by automatically learning both the spatial and temporal patterns from data. This formulation not only leads to greater expressive power but also stronger generalization capability. On two large datasets, Kinetics and NTU-RGBD, it achieves substantial improvements over mainstream methods.",
  "2503.06938": "The increasing pace of population aging calls for better care and support systems. Falling is a frequent and critical problem for elderly people causing serious long-term health issues. Fall detection from video streams is not an attractive option for real-life applications due to privacy issues. Existing methods try to resolve this issue by using very low-resolution cameras or video encryption. However, privacy cannot be ensured completely with such approaches. Key points on the body, such as skeleton joints, can convey significant information about motion dynamics and successive posture changes which are crucial for fall detection. Skeleton joints have been explored for feature extraction but with image recognition models that ignore joint dependency across frames which is important for the classification of actions. Moreover, existing models are over-parameterized or evaluated on small datasets with very few activity classes. We propose an efficient graph convolution network model that exploits spatio-temporal joint dependencies and dynamics of human skeleton joints for accurate fall detection. Our method leverages dynamic representation with robust concurrent spatio-temporal characteristics of skeleton joints. We performed extensive experiments on three large-scale datasets. With a significantly smaller model size than most existing methods, our proposed method achieves state-of-the-art results on the large scale NTU datasets.",
  "2111.15129": "Skeleton-based action recognition attracts practitioners and researchers due to the lightweight, compact nature of datasets. Compared with RGB-video-based action recognition, skeleton-based action recognition is a safer way to protect the privacy of subjects while having competitive recognition performance. However, due to improvements in skeleton recognition algorithms as well as motion and depth sensors, more details of motion characteristics can be preserved in the skeleton dataset, leading to potential privacy leakage. We first train classifiers to categorize private information from skeleton trajectories to investigate the potential privacy leakage from skeleton datasets. Our preliminary experiments show that the gender classifier achieves 87% accuracy on average, and the re-identification classifier achieves 80% accuracy on average with three baseline models: Shift-GCN, MS-G3D, and 2s-AGCN. We propose an anonymization framework based on adversarial learning to protect potential privacy leakage from the skeleton dataset. Experimental results show that an anonymized dataset can reduce the risk of privacy leakage while having marginal effects on action recognition performance even with simple anonymizer architectures. The code used in our experiments is available at https://github.com/ml-postech/Skeleton-anonymization/",
  "2203.12602": "Pre-training video transformers on extra large-scale datasets is generally required to achieve premier performance on relatively small datasets. In this paper, we show that video masked autoencoders (VideoMAE) are data-efficient learners for self-supervised video pre-training (SSVP). We are inspired by the recent ImageMAE and propose customized video tube masking with an extremely high ratio. This simple design makes video reconstruction a more challenging self-supervision task, thus encouraging extracting more effective video representations during this pre-training process. We obtain three important findings on SSVP: (1) An extremely high proportion of masking ratio (i.e., 90% to 95%) still yields favorable performance of VideoMAE. The temporally redundant video content enables a higher masking ratio than that of images. (2) VideoMAE achieves impressive results on very small datasets (i.e., around 3k-4k videos) without using any extra data. (3) VideoMAE shows that data quality is more important than data quantity for SSVP. Domain shift between pre-training and target datasets is an important issue. Notably, our VideoMAE with the vanilla ViT can achieve 87.4% on Kinetics-400, 75.4% on Something-Something V2, 91.3% on UCF101, and 62.6% on HMDB51, without using any extra data. Code is available at https://github.com/MCG-NJU/VideoMAE.",
  "2007.04687": "Violence detection has been studied in computer vision for years. However, previous work are either superficial, e.g., classification of short-clips, and the single scenario, or undersupplied, e.g., the single modality, and hand-crafted features based multimodality. To address this problem, in this work we first release a large-scale and multi-scene dataset named XD-Violence with a total duration of 217 hours, containing 4754 untrimmed videos with audio signals and weak labels. Then we propose a neural network containing three parallel branches to capture different relations among video snippets and integrate features, where holistic branch captures long-range dependencies using similarity prior, localized branch captures local positional relation using proximity prior, and score branch dynamically captures the closeness of predicted score. Besides, our method also includes an approximator to meet the needs of online detection. Our method outperforms other state-of-the-art methods on our released dataset and other existing benchmark. Moreover, extensive experimental results also show the positive effect of multimodal (audio-visual) input and modeling relationships. The code and dataset will be released in https://roc-ng.github.io/XD-Violence/.",
  "2208.02816": "Contrastive language-image pretraining has shown great success in learning visual-textual joint representation from web-scale data, demonstrating remarkable \"zero-shot\" generalization ability for various image tasks. However, how to effectively expand such new language-image pretraining methods to video domains is still an open problem. In this work, we present a simple yet effective approach that adapts the pretrained language-image models to video recognition directly, instead of pretraining a new model from scratch. More concretely, to capture the long-range dependencies of frames along the temporal dimension, we propose a cross-frame attention mechanism that explicitly exchanges information across frames. Such module is lightweight and can be plugged into pretrained language-image models seamlessly. Moreover, we propose a video-specific prompting scheme, which leverages video content information for generating discriminative textual prompts. Extensive experiments demonstrate that our approach is effective and can be generalized to different video recognition scenarios. In particular, under fully-supervised settings, our approach achieves a top-1 accuracy of 87.1% on Kinectics-400, while using 12 times fewer FLOPs compared with Swin-L and ViViT-H. In zero-shot experiments, our approach surpasses the current state-of-the-art methods by +7.6% and +14.9% in terms of top-1 accuracy under two popular protocols. In few-shot scenarios, our approach outperforms previous best methods by +32.1% and +23.1% when the labeled data is extremely limited. Code and models are available at https://aka.ms/X-CLIP",
  "2106.08827": "The availability of large-scale video action understanding datasets has facilitated advances in the interpretation of visual scenes containing people. However, learning to recognise human actions and their social interactions in an unconstrained real-world environment comprising numerous people, with potentially highly unbalanced and long-tailed distributed action labels from a stream of sensory data captured from a mobile robot platform remains a significant challenge, not least owing to the lack of a reflective large-scale dataset. In this paper, we introduce JRDB-Act, as an extension of the existing JRDB, which is captured by a social mobile manipulator and reflects a real distribution of human daily-life actions in a university campus environment. JRDB-Act has been densely annotated with atomic actions, comprises over 2.8M action labels, constituting a large-scale spatio-temporal action detection dataset. Each human bounding box is labeled with one pose-based action label and multiple~(optional) interaction-based action labels. Moreover JRDB-Act provides social group annotation, conducive to the task of grouping individuals based on their interactions in the scene to infer their social activities~(common activities in each social group). Each annotated label in JRDB-Act is tagged with the annotators' confidence level which contributes to the development of reliable evaluation strategies. In order to demonstrate how one can effectively utilise such annotations, we develop an end-to-end trainable pipeline to learn and infer these tasks, i.e. individual action and social group detection. The data and the evaluation code is publicly available at https://jrdb.erc.monash.edu/.",
  "2504.05299": "Large Vision-Language Models (VLMs) deliver exceptional performance but require significant computational resources, limiting their deployment on mobile and edge devices. Smaller VLMs typically mirror design choices of larger models, such as extensive image tokenization, leading to inefficient GPU memory usage and constrained practicality for on-device applications. We introduce SmolVLM, a series of compact multimodal models specifically engineered for resource-efficient inference. We systematically explore architectural configurations, tokenization strategies, and data curation optimized for low computational overhead. Through this, we identify key design choices that yield substantial performance gains on image and video tasks with minimal memory footprints. Our smallest model, SmolVLM-256M, uses less than 1GB GPU memory during inference and outperforms the 300-times larger Idefics-80B model, despite an 18-month development gap. Our largest model, at 2.2B parameters, rivals state-of-the-art VLMs consuming twice the GPU memory. SmolVLM models extend beyond static images, demonstrating robust video comprehension capabilities. Our results emphasize that strategic architectural optimizations, aggressive yet efficient tokenization, and carefully curated training data significantly enhance multimodal performance, facilitating practical, energy-efficient deployments at significantly smaller scales.",
  "1911.05913": "In recent years, surveillance cameras are widely deployed in public places, and the general crime rate has been reduced significantly due to these ubiquitous devices. Usually, these cameras provide cues and evidence after crimes are conducted, while they are rarely used to prevent or stop criminal activities in time. It is both time and labor consuming to manually monitor a large amount of video data from surveillance cameras. Therefore, automatically recognizing violent behaviors from video signals becomes essential. This paper summarizes several existing video datasets for violence detection and proposes the RWF-2000 database with 2,000 videos captured by surveillance cameras in real-world scenes. Also, we present a new method that utilizes both the merits of 3D-CNNs and optical flow, namely Flow Gated Network. The proposed approach obtains an accuracy of 87.25% on the test set of our proposed database. The database and source codes are currently open to access.",
  "1702.05552": "As humans we possess an intuitive ability for navigation which we master through years of practice; however existing approaches to model this trait for diverse tasks including monitoring pedestrian flow and detecting abnormal events have been limited by using a variety of hand-crafted features. Recent research in the area of deep-learning has demonstrated the power of learning features directly from the data; and related research in recurrent neural networks has shown exemplary results in sequence-to-sequence problems such as neural machine translation and neural image caption generation. Motivated by these approaches, we propose a novel method to predict the future motion of a pedestrian given a short history of their, and their neighbours, past behaviour. The novelty of the proposed method is the combined attention model which utilises both \"soft attention\" as well as \"hard-wired\" attention in order to map the trajectory information from the local neighbourhood to the future positions of the pedestrian of interest. We illustrate how a simple approximation of attention weights (i.e hard-wired) can be merged together with soft attention weights in order to make our model applicable for challenging real world scenarios with hundreds of neighbours. The navigational capability of the proposed method is tested on two challenging publicly available surveillance databases where our model outperforms the current-state-of-the-art methods. Additionally, we illustrate how the proposed architecture can be directly applied for the task of abnormal event detection without handcrafting the features.",
  "1801.04264": "Surveillance videos are able to capture a variety of realistic anomalies. In this paper, we propose to learn anomalies by exploiting both normal and anomalous videos. To avoid annotating the anomalous segments or clips in training videos, which is very time consuming, we propose to learn anomaly through the deep multiple instance ranking framework by leveraging weakly labeled training videos, i.e. the training labels (anomalous or normal) are at video-level instead of clip-level. In our approach, we consider normal and anomalous videos as bags and video segments as instances in multiple instance learning (MIL), and automatically learn a deep anomaly ranking model that predicts high anomaly scores for anomalous video segments. Furthermore, we introduce sparsity and temporal smoothness constraints in the ranking loss function to better localize anomaly during training. We also introduce a new large-scale first of its kind dataset of 128 hours of videos. It consists of 1900 long and untrimmed real-world surveillance videos, with 13 realistic anomalies such as fighting, road accident, burglary, robbery, etc. as well as normal activities. This dataset can be used for two tasks. First, general anomaly detection considering all anomalies in one group and all normal activities in another group. Second, for recognizing each of 13 anomalous activities. Our experimental results show that our MIL method for anomaly detection achieves significant improvement on anomaly detection performance as compared to the state-of-the-art approaches. We provide the results of several recent deep learning baselines on anomalous activity recognition. The low recognition performance of these baselines reveals that our dataset is very challenging and opens more opportunities for future work. The dataset is available at: https://webpages.uncc.edu/cchen62/dataset.html",
  "1705.07750": "The paucity of videos in current action classification datasets (UCF-101 and HMDB-51) has made it difficult to identify good video architectures, as most methods obtain similar performance on existing small-scale benchmarks. This paper re-evaluates state-of-the-art architectures in light of the new Kinetics Human Action Video dataset. Kinetics has two orders of magnitude more data, with 400 human action classes and over 400 clips per class, and is collected from realistic, challenging YouTube videos. We provide an analysis on how current architectures fare on the task of action classification on this dataset and how much performance improves on the smaller benchmark datasets after pre-training on Kinetics. We also introduce a new Two-Stream Inflated 3D ConvNet (I3D) that is based on 2D ConvNet inflation: filters and pooling kernels of very deep image classification ConvNets are expanded into 3D, making it possible to learn seamless spatio-temporal feature extractors from video while leveraging successful ImageNet architecture designs and even their parameters. We show that, after pre-training on Kinetics, I3D models considerably improve upon the state-of-the-art in action classification, reaching 80.9% on HMDB-51 and 98.0% on UCF-101."
};

// Full-text PDF for each paper (arXiv or the publisher's open-access copy).
export function pdfFor(p) {
  const m = p.url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
  if (m) return `https://arxiv.org/pdf/${m[1]}`;
  if (p.url.endsWith('.pdf')) return p.url;
  if (p.url.includes('openaccess.thecvf.com') && p.url.includes('/html/')) return p.url.replace('/html/', '/papers/').replace(/\.html$/, '.pdf');
  return null;
}
export const abstractFor = (p) => ABSTRACTS[p.url.match(/arxiv\.org\/abs\/(\d+\.\d+)/)?.[1]] ?? null;
