/* ============================================================
   data/repository.js — Contrato abstrato da camada de dados.
   Toda tela conversa com App.repo (uma instância de Repository).
   Hoje: LocalRepository (localStorage). Amanhã: ApiRepository (fetch)
   — basta implementar os mesmos métodos retornando Promises.
   Namespace: App.Repository (classe base)
   ============================================================ */
(function (App) {
  "use strict";

  function notImpl(name) {
    return function () { return Promise.reject(new Error("Repository." + name + " não implementado")); };
  }

  function Repository() {}
  Repository.prototype = {
    // sessão / conta global
    getCurrentUser: notImpl("getCurrentUser"),
    getUser: notImpl("getUser"),
    updateUser: notImpl("updateUser"),
    follow: notImpl("follow"),
    unfollow: notImpl("unfollow"),
    isFollowing: notImpl("isFollowing"),
    listFollowers: notImpl("listFollowers"),
    listFollowing: notImpl("listFollowing"),

    // comunidades
    listCommunities: notImpl("listCommunities"),
    getFeatured: notImpl("getFeatured"),
    getRecentCommunities: notImpl("getRecentCommunities"),
    getMyCommunities: notImpl("getMyCommunities"),
    getUserCommunities: notImpl("getUserCommunities"),
    getCommunity: notImpl("getCommunity"),
    createCommunity: notImpl("createCommunity"),
    updateCommunity: notImpl("updateCommunity"),
    joinCommunity: notImpl("joinCommunity"),
    leaveCommunity: notImpl("leaveCommunity"),
    deleteCommunity: notImpl("deleteCommunity"),
    isMember: notImpl("isMember"),

    // perfil de comunidade (membership)
    getMembership: notImpl("getMembership"),
    updateMembership: notImpl("updateMembership"),
    listMembers: notImpl("listMembers"),
    adjustReputation: notImpl("adjustReputation"),
    canModerate: notImpl("canModerate"),
    setRole: notImpl("setRole"),

    // chats / mensagens
    listChats: notImpl("listChats"),
    getChat: notImpl("getChat"),
    createChat: notImpl("createChat"),
    listMyChats: notImpl("listMyChats"),
    listMessages: notImpl("listMessages"),
    sendMessage: notImpl("sendMessage"),
    markRead: notImpl("markRead"),

    // feed
    listPosts: notImpl("listPosts"),
    createPost: notImpl("createPost"),
    toggleLikePost: notImpl("toggleLikePost"),

    // moderação
    moderate: notImpl("moderate"),
    liftModeration: notImpl("liftModeration"),
    listModeration: notImpl("listModeration"),

    // utilidades
    resetData: notImpl("resetData")
  };

  App.Repository = Repository;
})(window.App = window.App || {});
